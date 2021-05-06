import _logger from "electron-log";
import {BrowserWindow, Rectangle, app, screen} from "electron";
import {equals} from "remeda";
import {first} from "rxjs/operators";
import {lastValueFrom} from "rxjs";

import {Context} from "src/electron-main/model";
import {DEFAULT_WEB_PREFERENCES} from "./constants";
import {PRODUCT_NAME} from "src/shared/constants";
import {curryFunctionMembers} from "src/shared/util";
import {readConfigSync} from "src/electron-main/util";
import {syncFindInPageBrowserViewSize} from "src/electron-main/window/find-in-page";

const logger = curryFunctionMembers(_logger, __filename);

async function resolveBoundsToRestore(
    ctx: Context,
    currentBounds: Readonly<Rectangle>,
): Promise<Rectangle> {
    const config = await lastValueFrom(ctx.config$.pipe(first()));
    const {window: {bounds: savedBounds}} = config;
    const x = Math.max(
        savedBounds.x ?? currentBounds.x,
        0,
    );
    const y = Math.max(
        savedBounds.y ?? currentBounds.y,
        0,
    );
    const allDisplaysSummarySize: Readonly<{ width: number; height: number }> = screen.getAllDisplays().reduce(
        (accumulator: { width: number; height: number }, {size}) => {
            accumulator.width += size.width;
            accumulator.height += size.height;
            return accumulator;
        },
        {width: 0, height: 0},
    );
    const width = Math.max(
        Math.min(savedBounds.width, allDisplaysSummarySize.width),
        100,
    );
    const height = Math.max(
        Math.min(savedBounds.height, allDisplaysSummarySize.height),
        100,
    );
    const result = {
        width,
        height,
        x: Math.min(
            x,
            Math.max(allDisplaysSummarySize.width - width, 0),
        ),
        y: Math.min(
            y,
            Math.max(allDisplaysSummarySize.height - height, 0),
        ),
    } as const;

    logger.verbose(nameof(resolveBoundsToRestore), JSON.stringify({currentBounds, savedBounds, allDisplaysSummarySize, result}));

    return result;
}

async function keepBrowserWindowState(ctx: Context, browserWindow: Electron.BrowserWindow): Promise<void> {
    await (async (): Promise<void> => {
        const config = await lastValueFrom(ctx.config$.pipe(first()));
        const {window: {bounds}} = config;
        const hasSavedPosition = "x" in bounds && "y" in bounds;

        if (!hasSavedPosition) {
            browserWindow.center();
        }
    })();

    const saveWindowStateHandler = async (): Promise<void> => {
        await ctx.configStoreQueue.q(
            async () => {
                const config = await lastValueFrom(ctx.config$.pipe(first()));
                const storedWindowConfig = Object.freeze(config.window);
                const newWindowConfig = {...config.window};

                try {
                    newWindowConfig.maximized = browserWindow.isMaximized();

                    if (!newWindowConfig.maximized) {
                        newWindowConfig.bounds = browserWindow.getBounds();
                    }
                } catch (error) {
                    // "browserWindow" might be destroyed at this point
                    console.log(error); // eslint-disable-line no-console
                    logger.warn(nameof(keepBrowserWindowState), "failed to resolve window bounds", error);
                    return;
                }

                if (equals(storedWindowConfig, newWindowConfig)) {
                    return;
                }

                await ctx.configStore.write({
                    ...config,
                    window: newWindowConfig,
                });
            },
        );
    };
    const saveWindowStateHandlerDebounced = (
        (): () => void => {
            let timeoutId: any; // eslint-disable-line @typescript-eslint/no-explicit-any
            return (): void => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(saveWindowStateHandler, 500);
                syncFindInPageBrowserViewSize(ctx);
            };
        }
    )();

    browserWindow.on("close", saveWindowStateHandler);
    browserWindow.on("resize", saveWindowStateHandlerDebounced);
    browserWindow.on("move", saveWindowStateHandlerDebounced);
}

export async function initMainBrowserWindow(ctx: Context): Promise<BrowserWindow> {
    const state: { forceClose: boolean } = {forceClose: false};
    const appBeforeQuitEventArgs: ["before-quit", (event: Electron.Event) => void] = [
        "before-quit",
        (): true => state.forceClose = true,
    ];
    const browserWindow = new BrowserWindow({
        webPreferences: {
            ...DEFAULT_WEB_PREFERENCES,
            webviewTag: true,
            preload: BUILD_ENVIRONMENT === "e2e"
                ? ctx.locations.preload.browserWindowE2E
                : ctx.locations.preload.browserWindow,
        },
        title: PRODUCT_NAME,
        icon: ctx.locations.icon,
        show: false,
        autoHideMenuBar: true,
    });

    app.removeListener(...appBeforeQuitEventArgs);
    app.on(...appBeforeQuitEventArgs);

    browserWindow
        .once("ready-to-show", async () => {
            const boundsToRestore = await resolveBoundsToRestore(ctx, browserWindow.getBounds());

            logger.verbose(nameof(initMainBrowserWindow), JSON.stringify({boundsToRestore}));

            browserWindow.setBounds(boundsToRestore);

            // needs to be called after the "browserWindow.setBounds" call
            // since we don't want "setBounds" call to trigger the move/resize events handlers (leads to "maixmized" value loosing)
            await keepBrowserWindowState(ctx, browserWindow);

            if (
                !(await lastValueFrom(ctx.config$.pipe(first()))).startHidden
                ||
                // always showing the window when the settings is still not configured/saved
                !(await ctx.settingsStore.readable())
            ) {
                await (await ctx.deferredEndpoints.promise).activateBrowserWindow(browserWindow);
            }
        })
        .on("closed", () => {
            browserWindow.destroy();
            state.forceClose = false;
            app.quit();
        })
        .on("close", (event) => {
            if (state.forceClose) {
                event.returnValue = true;
            } else {
                event.preventDefault();
                event.returnValue = false;

                setTimeout(() => {
                    const config = readConfigSync(ctx);

                    if (!config) {
                        throw new Error(`No config file detected ("${ctx.configStore.file}")`);
                    }

                    if (config.hideOnClose) {
                        browserWindow.hide();
                    } else {
                        state.forceClose = true;
                        browserWindow.close(); // re-triggering the same "close" event
                    }
                });
            }

            return event.returnValue; // eslint-disable-line @typescript-eslint/no-unsafe-return
        });

    browserWindow.setMenu(null);

    await browserWindow.loadURL(ctx.locations.browserWindowPage);

    if (BUILD_ENVIRONMENT === "development") {
        browserWindow.webContents.openDevTools(/* {mode: "detach"} */);
    }

    return browserWindow;
}

