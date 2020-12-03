import ProxyAgent from "proxy-agent";
import compareVersions from "compare-versions";
import electronLog from "electron-log";
import fetch from "node-fetch";
import {app, dialog, shell} from "electron";
import {first, map, startWith} from "rxjs/operators";
import {from, merge, of, throwError} from "rxjs";
import {inspect} from "util";
import {isWebUri} from "valid-url";

import {Context} from "src/electron-main/model";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS, IpcMainApiEndpoints, IpcMainServiceScan} from "src/shared/api/main";
import {PACKAGE_GITHUB_PROJECT_URL, PACKAGE_VERSION, UPDATE_CHECK_FETCH_TIMEOUT} from "src/shared/constants";
import {PLATFORM} from "src/electron-main/constants";
import {applyZoomFactor} from "src/electron-main/window/util";
import {curryFunctionMembers} from "src/shared/util";
import {showAboutBrowserWindow} from "src/electron-main/window/about";

type Methods = keyof Pick<IpcMainApiEndpoints,
    | "activateBrowserWindow"
    | "openAboutWindow"
    | "openExternal"
    | "openSettingsFolder"
    | "quit"
    | "selectAccount"
    | "selectPath"
    | "toggleBrowserWindow"
    | "toggleControls"
    | "toggleLocalDbMailsListViewMode"
    | "updateCheck"
    | "notification"
    | "log">;

type ContextAwareMethods = keyof Pick<IpcMainApiEndpoints,
    | "hotkey">;

const logger = curryFunctionMembers(electronLog, "[src/electron-main/api/endpoints-builders/general]");

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<IpcMainApiEndpoints, Methods> & Pick<IpcMainServiceScan["ApiImpl"], ContextAwareMethods>> {
    const endpoints: Unpacked<ReturnType<typeof buildEndpoints>> = {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async openAboutWindow() {
            await showAboutBrowserWindow(ctx);
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async openExternal({url}) {
            if (!isWebUri(url)) {
                throw new Error(`Forbidden url "${url}" opening has been prevented`);
            }

            await shell.openExternal(url, {activate: true});
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async openSettingsFolder() {
            const errorMessage = await shell.openPath(ctx.locations.userDataDir);

            if (errorMessage) {
                throw new Error(errorMessage);
            }
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async quit() {
            app.exit();
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async activateBrowserWindow(browserWindow = ctx.uiContext && ctx.uiContext.browserWindow) {
            if (!browserWindow) {
                return;
            }

            const {window: {maximized}} = await ctx.config$.pipe(first()).toPromise();

            await applyZoomFactor(ctx, browserWindow.webContents);

            if (maximized) {
                browserWindow.maximize();

                // above "maximize()" call is supposed to show the window
                // but sometimes it doesn't on some systems (especially macOS)
                if (!browserWindow.isVisible()) {
                    browserWindow.show();
                }
            } else {
                browserWindow.show();
            }

            browserWindow.focus();

            IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.ActivateBrowserWindow());
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async toggleBrowserWindow(arg) {
            const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;

            if (!browserWindow) {
                return;
            }

            if (
                (arg && arg.forcedState)
                ||
                !browserWindow.isVisible()
            ) {
                await endpoints.activateBrowserWindow(browserWindow);
            } else {
                browserWindow.hide();
            }
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async selectAccount(args) {
            const prevSelectedAccount = ctx.selectedAccount;
            const newSelectedAccount = "reset" in args
                ? undefined
                : {
                    webContentId: args.webContentId,
                    databaseView: args.databaseView,
                };
            const needToCloseFindInPageWindow = (
                // reset - no accounts in the list
                !newSelectedAccount
                ||
                // TODO figure how to hide webview from search while in database view mode
                //      webview can't be detached from DOM as it gets reloaded when reattached
                //      search is not available in database view mode until then
                newSelectedAccount.databaseView
                ||
                // changed selected account
                prevSelectedAccount && prevSelectedAccount.webContentId !== newSelectedAccount.webContentId
            );

            if (needToCloseFindInPageWindow) {
                await (await ctx.deferredEndpoints.promise).findInPageStop();
                await (await ctx.deferredEndpoints.promise).findInPageDisplay({visible: false});
            }

            ctx.selectedAccount = newSelectedAccount;
        },

        selectPath() {
            const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;

            if (!browserWindow) {
                return throwError(new Error("Failed to resolve main app window"));
            }

            return merge(
                of({message: "timeout-reset"}), // resets api calling timeouts (dialog potentially can be opened for a long period of time)
                from(
                    dialog.showOpenDialog(
                        browserWindow,
                        {
                            title: "Select file system directory ...",
                            defaultPath: app.getPath("home"),
                            properties: ["openDirectory"],
                        },
                    ),
                ).pipe(
                    map(({canceled, filePaths: [location]}) => {
                        if (canceled) {
                            return {message: "canceled"} as const;
                        }
                        if (!location) {
                            throw new Error("Location resolving failed");
                        }
                        return {location} as const;
                    }),
                ),
            );
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async hotkey({type}) {
            const methodContext = this;  // eslint-disable-line @typescript-eslint/no-this-alias

            if (!methodContext) {
                throw new Error(`Failed to resolve "hotkey" method execution context`);
            }

            const [{sender: webContents}] = methodContext.args;

            if (PLATFORM !== "darwin") {
                return;
            }

            switch (type) {
                case "copy":
                    webContents.copy();
                    break;
                case "paste":
                    webContents.paste();
                    break;
                case "selectAll":
                    webContents.selectAll();
                    break;
                default:
                    throw new Error(`Unknown hotkey "type" value:  "${String(type)}"`);
            }
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        updateCheck: (() => {
            const releasesUrlPrefix = `${PACKAGE_GITHUB_PROJECT_URL}/releases/tag`;
            const tagNameFilterRe = /[^a-z0-9._-]/gi;
            const filterAssetName: (name: string) => boolean = (
                (): (name: string) => boolean => {
                    const assetNameRegExpKeywords: Readonly<Partial<Record<NodeJS.Platform, readonly string[]>>> = {
                        darwin: [
                            "-darwin",
                            "-mac",
                            "-osx",
                            ".dmg$",
                        ],
                        linux: [
                            "-freebsd",
                            "-linux",
                            "-openbsd",
                            ".AppImage$",
                            ".deb$",
                            ".freebsd$",
                            ".pacman$",
                            ".rpm$",
                            ".snap$",
                        ],
                        win32: [
                            "-win",
                            // "-win32",
                            // "-windows",
                            ".exe$",
                        ],
                    };
                    const assetNameRegExp = new RegExp(
                        (
                            assetNameRegExpKeywords[PLATFORM]
                            ||
                            // any file name for any platform other than darwin/linux/win32
                            [".*"]
                        ).join("|"),
                        "i",
                    );
                    let assetNameRegExpLogged = false;

                    return (name: string): boolean => {
                        if (!assetNameRegExpLogged) {
                            assetNameRegExpLogged = true;
                            logger.verbose(
                                "updateCheck()",
                                inspect({assetNameRegExp}),
                            );
                        }
                        return assetNameRegExp.test(name);
                    };
                }
            )();

            return async (): Promise<IpcMainServiceScan["ApiImplReturns"]["updateCheck"]> => {
                const {updateCheck: {releasesUrl, proxy}} = await ctx.config$.pipe(first()).toPromise();
                const response = await fetch(
                    releasesUrl,
                    {
                        method: "GET",
                        timeout: UPDATE_CHECK_FETCH_TIMEOUT,
                        ...(
                            proxy && {
                                agent: new ProxyAgent(proxy) as unknown as import("http").Agent,
                            }
                        ),
                    },
                );

                if (!response.ok) {
                    // https://developer.github.com/v3/#rate-limiting
                    const rateLimitResetHeaderValue = Number(
                        response.headers.get("X-RateLimit-Reset"),
                    );
                    const rateLimitError = (
                        response.status === 403
                        &&
                        !isNaN(rateLimitResetHeaderValue)
                        &&
                        rateLimitResetHeaderValue > 0
                    );
                    const errorMessageData = JSON.stringify({
                        url: releasesUrl,
                        status: response.status,
                        statusText: response.statusText,
                    });

                    if (rateLimitError) {
                        // TODO consider enabling retry logic
                        logger.error(new Error(`Update check failed (ignored as rate limit error): ${errorMessageData}`));
                        return [];
                    }

                    throw new Error(`Update check failed: ${errorMessageData}`);
                }

                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const releases: Array<{
                    tag_name: string;
                    published_at: string;
                    assets: Array<{ name: string }>;
                }> = await response.json();

                logger.verbose(
                    "updateCheck()",
                    JSON.stringify({
                        releasesCount: releases.length,
                        PACKAGE_VERSION,
                        PLATFORM,
                    }),
                );

                const newReleases = releases
                    .filter(({tag_name: tagName}) => compareVersions(tagName, PACKAGE_VERSION) > 0)
                    .filter(({assets}) => assets.some(({name}) => filterAssetName(name)))
                    .sort((o1, o2) => compareVersions(o1.tag_name, o2.tag_name))
                    .reverse()
                    .map(({tag_name: tagName, published_at: date}) => {
                        const title = tagName.replace(tagNameFilterRe, "");
                        const tagNameValid = title === tagName;
                        // we don't use a raw "html_url" value but sanitize the url
                        const url = tagNameValid
                            ? `${releasesUrlPrefix}/${tagName}`
                            : undefined;
                        return {title, url, date} as const;
                    });

                logger.verbose(
                    "updateCheck()",
                    JSON.stringify({newReleases}, null, 2),
                );

                return newReleases;
            };
        })(),

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async toggleControls(arg) {
            IPC_MAIN_API_NOTIFICATION$.next(
                IPC_MAIN_API_NOTIFICATION_ACTIONS.ConfigUpdated(
                    await ctx.configStoreQueue.q(async () => {
                        const config = await ctx.config$.pipe(first()).toPromise();
                        const {hideControls} = arg || {hideControls: !config.hideControls};

                        return ctx.configStore.write({
                            ...config,
                            hideControls,
                        });
                    }),
                ),
            );
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async toggleLocalDbMailsListViewMode() {
            return ctx.configStoreQueue.q(async () => {
                const config = await ctx.configStore.readExisting();

                return ctx.configStore.write({
                    ...config,
                    localDbMailsListViewMode: config.localDbMailsListViewMode === "plain"
                        ? "conversation"
                        : "plain",
                });
            });
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        notification() {
            return IPC_MAIN_API_NOTIFICATION$.asObservable().pipe(
                // TODO replace "startWith" with "defaultIfEmpty" (simply some response needed to avoid timeout error)
                startWith(IPC_MAIN_API_NOTIFICATION_ACTIONS.Bootstrap({})),
            );
        },

        async log({level, args}) {
            electronLog[level](...args);
        },
    };

    return endpoints;
}
