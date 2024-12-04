import _logger from "electron-log";
import {
    app, BrowserWindow, clipboard, Menu, MenuItemConstructorOptions, screen, Session, webContents as electronWebContents, WebPreferences,
} from "electron";
import {first} from "rxjs/operators";
import {inspect} from "util";
import {isDeepEqual, pick} from "remeda";
import {isWebUri} from "valid-url";
import {lastValueFrom} from "rxjs";

import {applyZoomFactor} from "src/electron-main/window/util";
import {buildUrlOriginsFailedMsgTester} from "src/shared/util/url";
import {Context} from "./model";
import {curryFunctionMembers, lowerConsoleMessageEventLogLevel} from "src/shared/util";
import {DEFAULT_WEB_PREFERENCES, DEFAULT_WEB_PREFERENCES_KEYS} from "src/electron-main/window/constants";
import {depersonalizeLoggedUrlsInString} from "src/shared/util/proton-url";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/const";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {LOCAL_WEBCLIENT_ORIGIN} from "src/shared/const";
import {PLATFORM} from "src/electron-main/constants";

const logger = curryFunctionMembers(_logger, __filename);

type checkWebViewWebPreferencesDefaultsType = (webPreferences: WebPreferences) => boolean;

const checkWebViewWebPreferencesDefaults: checkWebViewWebPreferencesDefaultsType = (() => {
    const expected = DEFAULT_WEB_PREFERENCES;
    const pickKeys = DEFAULT_WEB_PREFERENCES_KEYS;
    const resultFn: checkWebViewWebPreferencesDefaultsType = (webPreferences) => {
        const actual = pick(webPreferences, pickKeys);
        const same = isDeepEqual(actual, expected);
        if (!same) {
            // TODO figure is the following props not getting precisely translated to "webview.WebPreferences"
            //      expected Electron behavior (prop: expected value => actually received value):
            //     - backgroundThrottling: false => undefined,
            //     - disableBlinkFeatures: "Auxclick" => "",
            //     - nodeIntegrationInWorker: false => undefined,
            //     - webviewTag: false => undefined
            logger.verbose(`Default/expected and actual "webview.webPreferences" props are not equal: `, inspect({actual, expected}));
        }
        return same;
    };
    return resultFn;
})();

const isEmailHref = (href: string): boolean => {
    return String(href).startsWith("mailto:");
};

const extractEmailIfEmailHref = (href: string): string => {
    return isEmailHref(href)
        ? String(href.split("mailto:").pop())
        : href;
};

const notifyLogAndThrow = (message: string): never => {
    IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.ErrorMessage({message}));
    const error = new Error(message);
    logger.error(error);
    throw error;
};

export async function applySpellcheckOptionsChange(
    ctx: DeepReadonly<Context>,
    {enabled, languages, skipConfigSaving, sessionInstance}: {
        enabled?: boolean;
        languages?: string[];
        skipConfigSaving?: boolean;
        sessionInstance?: Session;
    },
): Promise<void> {
    if (!skipConfigSaving) {
        IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.ConfigUpdated(
            await ctx.configStoreQueue.q(async () => {
                const config = await ctx.configStore.readExisting();
                if (typeof enabled === "boolean") {
                    config.spellcheck = enabled;
                }
                if (languages?.length) {
                    config.spellcheckLanguages = languages;
                }
                return ctx.configStore.write(config);
            }),
        ));
    }
    const sessions: readonly Session[] = sessionInstance
        ? [sessionInstance]
        : electronWebContents.getAllWebContents().map((value) => value.session);
    for (const session of sessions) {
        if (typeof enabled === "boolean") {
            session.setSpellCheckerEnabled(enabled);
        }
        if (languages?.length && PLATFORM !== "darwin") { // on macOS dictionaries list gets defined by the system
            const availableLanguages = new Set(session.availableSpellCheckerLanguages);
            session.setSpellCheckerLanguages(
                // WARN only applying the "available" languages (error gets thrown otherwise, which is expected behavior)
                languages.filter((language) => availableLanguages.has(language)),
            );
        }
    }
}

// WARN: needs to be called before "BrowserWindow" creating (has been ensured by tests)
export async function initWebContentsCreatingHandlers(ctx: Context): Promise<void> {
    const emptyArray = [] as const;
    const endpoints = await ctx.deferredEndpoints.promise;
    const verifyWebviewUrlAccess = buildUrlOriginsFailedMsgTester([LOCAL_WEBCLIENT_ORIGIN]);

    app.on("web-contents-created", async (...[, webContents]) => {
        webContents.setWebRTCIPHandlingPolicy("default_public_interface_only");

        setImmediate(async () => {
            const config = await lastValueFrom(ctx.config$.pipe(first()));
            await applySpellcheckOptionsChange(ctx, {
                enabled: config.spellcheck,
                languages: config.spellcheckLanguages,
                skipConfigSaving: true,
                sessionInstance: webContents.session,
            });
        });

        const uiContext = ctx.uiContext && await ctx.uiContext;
        const isFullTextSearchBrowserWindow = uiContext?.fullTextSearchBrowserWindow?.webContents === webContents;

        webContents.on(
            "certificate-error",
            (...[/*event*/, /*webContents*/ , url, error]) => logger.error(JSON.stringify({type: "certificate-error", url}), error),
        );
        webContents.on("console-message", (...[/*event*/, level, message, line, sourceId]) => {
            const isWarn = Number(level) === 2;
            const isError = Number(level) === 3;
            const isFullTextSearchInstanceError = isError
                && isFullTextSearchBrowserWindow
                // fallback html-to-text conversion is iframe-based, so a lot of false-positive CSP-related errors will likely happen
                && ["Content Security Policy", "CSP"].some((pattern) => message.includes(pattern));
            if ((isWarn || isError) && !isFullTextSearchInstanceError) {
                logger[lowerConsoleMessageEventLogLevel(isWarn ? "warn" : "error", message)](
                    JSON.stringify({
                        type: "console-message",
                        level,
                        message: depersonalizeLoggedUrlsInString(message),
                        line,
                        sourceId: depersonalizeLoggedUrlsInString(sourceId),
                    }),
                );
            }
        });
        webContents.on(
            "did-fail-load",
            (...[/*event*/, errorCode, errorDescription, validatedURL, isMainFrame, frameProcessId, frameRoutingId]) => {
                logger.error(
                    JSON.stringify({
                        type: "did-fail-load",
                        errorCode,
                        errorDescription,
                        validatedURL,
                        isMainFrame,
                        frameProcessId,
                        frameRoutingId,
                    }),
                );
            },
        );
        webContents.on(
            "did-fail-provisional-load",
            (...[/*event*/, errorCode, errorDescription, validatedURL, isMainFrame, frameProcessId, frameRoutingId]) => { // eslint-disable-line sonarjs/no-identical-functions, max-len
                logger.error(
                    JSON.stringify({
                        type: "did-fail-provisional-load",
                        errorCode,
                        errorDescription,
                        validatedURL,
                        isMainFrame,
                        frameProcessId,
                        frameRoutingId,
                    }),
                );
            },
        );
        webContents.on(
            "plugin-crashed",
            (...[/*event*/, name, version]) => logger.error(JSON.stringify({type: "plugin-crashed", name, version})),
        );
        webContents.on(
            "preload-error",
            (...[/*event*/, preloadPath, error]) => logger.error(JSON.stringify({type: "preload-error", preloadPath}), error),
        );
        webContents.on(
            "render-process-gone",
            (...[/*event*/, details]) => logger.error(JSON.stringify({type: "render-process-gone", details})),
        );
        webContents.setWindowOpenHandler(({url}) => {
            if (isWebUri(url)) {
                endpoints.openExternal({url}).catch((error) => {
                    logger.error(error);
                });
            } else {
                logger.warn(`Opening a new window is forbidden, url: "${url}"`);
            }
            return {action: "deny"};
        });
        webContents.on(
            "context-menu",
            async (...[/*event*/, {editFlags, linkURL, linkText, isEditable, /*spellcheckEnabled,*/ dictionarySuggestions}]) => {
                const menuItems: MenuItemConstructorOptions[] = [];
                // TODO use "spellcheckEnabled" param of the "context-menu" instead of the config's value
                // currently getting the config's value since:
                // - "spellcheckEnabled" value from the "context-menu"'s params can't be used since for some reason its value doesn't get
                //    changed by the session.setSpellCheckerEnabled() call, so it seems to remain in a static state (keeping initial value)
                // - session.getSpellCheckerEnabled() can't be used since it always returns "true"
                //   until the session.setSpellCheckerEnabled() called via the content menu
                //   calling it at the init stage not via the content menu doesn't seem to make an effect
                const spellcheckEnabled = await (async () => {
                    const config = await lastValueFrom(ctx.config$.pipe(first()));
                    return config.spellcheck;
                })();

                if (linkURL) {
                    menuItems.push({
                        label: isEmailHref(linkURL) ? "Copy Email Address" : "Copy Link Address",
                        click() {
                            if (PLATFORM === "darwin") {
                                clipboard.writeBookmark(linkText, extractEmailIfEmailHref(linkURL));
                            } else {
                                clipboard.writeText(extractEmailIfEmailHref(linkURL));
                            }
                        },
                    });
                } else {
                    menuItems.push(...[...(menuItems.length ? [{type: "separator"} as const] : emptyArray), ...[
                        // TODO use "role" based "cut/copy/paste" actions, currently these actions don't work properly
                        // keep track of the respective issue https://github.com/electron/electron/issues/15219
                        ...(editFlags.canCut ? [{label: "Cut", click: () => webContents.cut()}] : emptyArray),
                        ...(editFlags.canCopy ? [{label: "Copy", click: () => webContents.copy()}] : emptyArray),
                        ...(editFlags.canPaste ? [{label: "Paste", click: () => webContents.paste()}] : emptyArray),
                        ...(editFlags.canSelectAll ? [{label: "Select All", click: () => webContents.selectAll()}] : emptyArray),
                    ]]);
                }

                if (isEditable) { // spellchecker
                    if (menuItems.length) menuItems.push({type: "separator"});
                    if (spellcheckEnabled) {
                        for (const suggestion of dictionarySuggestions) {
                            menuItems.push({label: suggestion, click: () => webContents.replaceMisspelling(suggestion)});
                        }
                        if (PLATFORM !== "darwin") { // on macOS dictionaries list gets defined by the system
                            const enabledLanguages = new Set(webContents.session.getSpellCheckerLanguages());
                            const languagesSubmenu: typeof menuItems = [];
                            for (const availableLanguage of webContents.session.availableSpellCheckerLanguages) {
                                const availableLanguageEnabled = enabledLanguages.has(availableLanguage);
                                languagesSubmenu.push({
                                    label: availableLanguage,
                                    type: "checkbox",
                                    checked: availableLanguageEnabled,
                                    async click() {
                                        const enabled = availableLanguageEnabled && enabledLanguages.size === 1
                                            ? false // disabling the feature when no selected items remain in the list
                                            : undefined;
                                        await applySpellcheckOptionsChange(ctx, {
                                            enabled,
                                            languages: availableLanguageEnabled
                                                ? Array.from(enabledLanguages).filter((value) => value !== availableLanguage)
                                                : [...enabledLanguages, availableLanguage],
                                        });
                                    },
                                });
                            }
                            if (languagesSubmenu.length) {
                                menuItems.push({label: "Languages", submenu: languagesSubmenu});
                            }
                        }
                    }
                    menuItems.push({
                        label: "Check spelling",
                        type: "checkbox",
                        checked: spellcheckEnabled,
                        async click() {
                            await applySpellcheckOptionsChange(ctx, {enabled: !spellcheckEnabled});
                        },
                    });
                }

                if (menuItems.length) Menu.buildFromTemplate(menuItems).popup({});
            },
        );
        {
            const eventType = "will-attach-webview";
            webContents.on(eventType, (...[event, webPreferences, {src}]) => {
                if (!src) {
                    throw new Error(`Invalid/empty "src" value received in "${eventType}" handler`);
                }
                const bannedAccessMsg = verifyWebviewUrlAccess(src);
                if (typeof bannedAccessMsg === "string") {
                    event.preventDefault();
                    notifyLogAndThrow(`Forbidden "webview.src" value: "${JSON.stringify({src, eventType})}". ${bannedAccessMsg}`);
                }
                if (!checkWebViewWebPreferencesDefaults(webPreferences)) {
                    Object.assign(webPreferences, DEFAULT_WEB_PREFERENCES);
                }
            });
        }
        {
            const eventType = "did-attach-webview";
            webContents.on(eventType, (...[, webViewWebContents]) => {
                webViewWebContents.on("will-navigate", (...[willNavigateEvent, src]) => {
                    const bannedAccessMsg = verifyWebviewUrlAccess(src);
                    if (typeof bannedAccessMsg === "string") {
                        willNavigateEvent.preventDefault();
                        notifyLogAndThrow(`Forbidden "webview.src" value: "${JSON.stringify({src, eventType})}". ${bannedAccessMsg}`);
                    }
                });
            });
        }
        webContents.on("update-target-url", (...[, url]) => {
            const focusedWindow = BrowserWindow.getFocusedWindow();

            if (!url || !focusedWindow) {
                IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.TargetUrl({url}));
                return;
            }

            const cursorScreenPoint = screen.getCursorScreenPoint();
            const focusedWindowBounds = focusedWindow.getBounds();

            IPC_MAIN_API_NOTIFICATION$.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.TargetUrl({
                url,
                position: {
                    // TODO subtract width/height of devtools window
                    //      currenty devloots window should be closed/detached for percent size to be properly calculated
                    cursorXPercent: (cursorScreenPoint.x - focusedWindowBounds.x) / (focusedWindowBounds.width / 100),
                    // TODO take window titlebar into the account
                    cursorYPercent: (cursorScreenPoint.y - focusedWindowBounds.y) / (focusedWindowBounds.height / 100),
                },
            }));
        });

        await applyZoomFactor(ctx, webContents);
    });
}
