import ProxyAgent from "proxy-agent";
import compareVersions from "compare-versions";
import electronLog from "electron-log";
import fetch from "node-fetch";
import {ReposListReleasesResponse} from "@octokit/rest";
import {app, shell} from "electron";
import {inspect} from "util";
import {isWebUri} from "valid-url";
import {startWith, take} from "rxjs/operators";

import {Context} from "src/electron-main/model";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS, IpcMainApiEndpoints, IpcMainServiceScan} from "src/shared/api/main";
import {PACKAGE_VERSION, UPDATE_CHECK_FETCH_TIMEOUT} from "src/shared/constants";
import {PLATFORM} from "src/electron-main/constants";
import {curryFunctionMembers} from "src/shared/util";
import {showAboutBrowserWindow} from "src/electron-main/window/about";

type Methods = keyof Pick<IpcMainApiEndpoints,
    | "openAboutWindow"
    | "openExternal"
    | "openSettingsFolder"
    | "quit"
    | "activateBrowserWindow"
    | "toggleBrowserWindow"
    | "updateCheck"
    | "toggleControls"
    | "toggleLocalDbMailsListViewMode"
    | "notification">;

type ContextAwareMethods = keyof Pick<IpcMainApiEndpoints,
    | "selectAccount"
    | "hotkey">;

const logger = curryFunctionMembers(electronLog, "[src/electron-main/api/endpoints-builders/general]");

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<IpcMainApiEndpoints, Methods> & Pick<IpcMainServiceScan["ApiImpl"], ContextAwareMethods>> {
    const endpoints: Unpacked<ReturnType<typeof buildEndpoints>> = {
        async openAboutWindow() {
            await showAboutBrowserWindow(ctx);
        },

        async openExternal({url}) {
            if (!isWebUri(url)) {
                throw new Error(`Forbidden url "${url}" opening has been prevented`);
            }

            await shell.openExternal(url, {activate: true});
        },

        async openSettingsFolder() {
            const errorMessage = await shell.openPath(ctx.locations.userDataDir);

            if (errorMessage) {
                throw new Error(errorMessage);
            }
        },

        async quit() {
            app.exit();
        },

        async activateBrowserWindow(browserWindow = ctx.uiContext && ctx.uiContext.browserWindow) {
            if (!browserWindow) {
                return;
            }

            const {window: {maximized}} = await ctx.configStore.readExisting();

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

        async selectAccount({databaseView, reset}) {
            const methodContext = this;

            if (!methodContext) {
                throw new Error(`Failed to resolve "selectAccount" method execution context`);
            }

            const [{sender: webContents}] = methodContext.args;

            const prevSelectedAccount = ctx.selectedAccount;
            const newSelectedAccount = reset
                ? undefined
                : {
                    webContentId: webContents.id,
                    databaseView,
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

        async hotkey({type}) {
            const methodContext = this;

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
                    throw new Error(`Unknown hotkey "type" value:  "${type}"`);
            }
        },

        updateCheck: (() => {
            const releasesUrlPrefix = "https://github.com/vladimiry/ElectronMail/releases/tag";
            const tagNameFilterRe = /[^a-z0-9._-]/gi;
            const filterAssetName: (name: string) => boolean = (() => {
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
                let assetNameRegExpLogged: boolean = false;

                return (name: string) => {
                    if (!assetNameRegExpLogged) {
                        assetNameRegExpLogged = true;
                        logger.verbose(
                            "updateCheck()",
                            inspect({assetNameRegExp}),
                        );
                    }
                    return assetNameRegExp.test(name);
                };
            })();

            return async () => {
                const {updateCheck: {releasesUrl, proxy}} = await ctx.configStore.readExisting();
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

                const releases: ReposListReleasesResponse = await response.json();
                logger.verbose(
                    "updateCheck()",
                    JSON.stringify({
                        releasesCount: releases.length,
                        PACKAGE_VERSION,
                        PLATFORM,
                    }),
                );

                const resultItems = releases
                    .filter(({tag_name}) => compareVersions(tag_name, PACKAGE_VERSION) > 0)
                    .filter(({assets}) => assets.some(({name}) => filterAssetName(name)))
                    .sort((o1, o2) => compareVersions(o1.tag_name, o2.tag_name))
                    .reverse()
                    .map(({tag_name, published_at: date}) => {
                        const title = tag_name.replace(tagNameFilterRe, "");
                        const tagNameValid = title === tag_name;
                        // we don't use a raw "html_url" value but sanitize the url
                        const url = tagNameValid
                            ? `${releasesUrlPrefix}/${tag_name}`
                            : undefined;
                        return {title, url, date};
                    });
                logger.verbose(
                    "updateCheck()",
                    JSON.stringify({resultItems}, null, 2),
                );

                return resultItems;
            };
        })(),

        async toggleControls(arg) {
            const config = await ctx.config$
                .pipe(take(1))
                .toPromise();
            const {hideControls} = arg || {hideControls: !config.hideControls};

            IPC_MAIN_API_NOTIFICATION$.next(
                IPC_MAIN_API_NOTIFICATION_ACTIONS.ConfigUpdated(
                    await ctx.configStore.write({
                        ...config,
                        hideControls,
                    }),
                ),
            );
        },

        async toggleLocalDbMailsListViewMode() {
            const config = await ctx.configStore.readExisting();

            return ctx.configStore.write({
                ...config,
                localDbMailsListViewMode: config.localDbMailsListViewMode === "plain"
                    ? "conversation"
                    : "plain",
            });
        },

        notification() {
            return IPC_MAIN_API_NOTIFICATION$.asObservable().pipe(
                startWith(IPC_MAIN_API_NOTIFICATION_ACTIONS.Bootstrap({})),
            );
        },
    };

    return endpoints;
}
