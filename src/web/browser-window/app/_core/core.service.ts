import type {Action} from "@ngrx/store";
import {Actions} from "@ngrx/effects";
import {concat, EMPTY, lastValueFrom, Observable, race, timer} from "rxjs";
import {filter, first, mergeMap, take, takeUntil} from "rxjs/operators";
import {Injectable, NgZone} from "@angular/core";
import {select, Store} from "@ngrx/store";
import {URL} from "@ghostery/url-parser";
import UUID from "pure-uuid";

import {AccountConfig} from "src/shared/model/account";
import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {asyncDelay, curryFunctionMembers} from "src/shared/util";
import {FIRE_SYNCING_ITERATION$, SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/browser-window/app/app.constants";
import {IpcMainServiceScan} from "src/shared/api/main-process";
import {LOCAL_WEBCLIENT_ORIGIN, WEB_CLIENTS_BLANK_HTML_FILE_NAME} from "src/shared/const";
import {ofType} from "src/shared/util/ngrx-of-type";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {parseUrlOriginWithNullishCheck} from "src/shared/util/url";
import {ProtonClientSession} from "src/shared/model/proton";
import {PROVIDER_REPO_MAP} from "src/shared/const/proton-apps";
import {State} from "src/web/browser-window/app/store/reducers/root";
import {WebAccount} from "src/web/browser-window/app/model";

@Injectable()
export class CoreService {
    constructor(
        private store: Store<State>,
        private zone: NgZone,
        private readonly actions$: Actions,
    ) {}

    parseEntryUrl(
        {entryUrl}: WebAccount["accountConfig"],
        repoType: keyof typeof PROVIDER_REPO_MAP,
    ): Readonly<{entryPageUrl: string; sessionStorage: {apiEndpointOrigin: string}}> {
        if (!entryUrl || !entryUrl.startsWith("https://")) {
            throw new Error(`Invalid "${JSON.stringify({entryUrl})}" value`);
        }
        const {basePath} = PROVIDER_REPO_MAP[repoType];
        return {
            entryPageUrl: `${LOCAL_WEBCLIENT_ORIGIN}${basePath ? "/" + basePath : ""}`,
            sessionStorage: {apiEndpointOrigin: parseUrlOriginWithNullishCheck(entryUrl)},
        };
    }

    // TODO move method to "_accounts/*.service"
    async applyProtonClientSessionAndNavigate(
        accountConfig: WebAccount["accountConfig"],
        repoType: keyof typeof PROVIDER_REPO_MAP,
        webViewDomReady$: import("rxjs").Observable<Electron.WebviewTag>,
        setWebViewSrc: (src: string) => void,
        logger_: import("src/shared/model/common").Logger,
        ngOnDestroy$: Observable<void>,
        savedSessionData?: {
            clientSession?: ProtonClientSession | null;
            sessionStoragePatch?: IpcMainServiceScan["ApiImplReturns"]["resolvedSavedSessionStoragePatch"] | null;
        },
    ): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const logger = curryFunctionMembers(logger_, __filename, nameof(CoreService.prototype.applyProtonClientSessionAndNavigate));
        const loaderId = new UUID(4).format();
        const loaderIdParam = "loader-id";
        const loaderSrcOrigin = parseUrlOriginWithNullishCheck(
            this.parseEntryUrl(accountConfig, repoType).entryPageUrl,
        );
        const loaderSrc = `${loaderSrcOrigin}/${WEB_CLIENTS_BLANK_HTML_FILE_NAME}?${loaderIdParam}=${loaderId}`;
        const {webViewBlankDOMLoaded: loaderIdTimeoutMs} = await lastValueFrom(
            this.store.pipe(
                select(OptionsSelectors.CONFIG.timeouts),
                first(),
            ),
        );

        await Promise.all([
            (async () => {
                logger.verbose(nameof(asyncDelay));
                await asyncDelay(150);
                logger.verbose(nameof(setWebViewSrc));
                setWebViewSrc(loaderSrc);
            })(),

            (async () => {
                let webView: Electron.WebviewTag | void;

                try {
                    logger.verbose(nameof(webViewDomReady$));
                    webView = await lastValueFrom(
                        race(
                            webViewDomReady$.pipe(
                                filter(({src}) => {
                                    const result = Boolean(src) && new URL(src).searchParams.get(loaderIdParam) === loaderId;
                                    logger.verbose(`${nameof(webViewDomReady$)} ${nameof(filter)}`, JSON.stringify({src, result}));
                                    return result;
                                }),
                                takeUntil(timer(loaderIdTimeoutMs)),
                                first(), // "first()" throws error if stream closed without any event passed through
                            ),
                            ngOnDestroy$,
                        ),
                    );
                } catch (error) {
                    const message = `Failed to load "${loaderSrc}" page in ${loaderIdTimeoutMs}ms`;
                    logger.error(message, error);
                    throw new Error(message);
                }

                if (!webView) {
                    logger.error(`${nameof(ngOnDestroy$)} triggered and so ${nameof(webView)} initialization gets cancelled`);
                    return;
                }

                const javaScriptCode = (() => {
                    const generateSessionStoragePatchingCode = (patch: Record<string, unknown>): string => {
                        return `(() => {
                            const sessionStorageStr = ${JSON.stringify(JSON.stringify(patch))};
                            const sessionStorageParsed = JSON.parse(sessionStorageStr);
                            for (const [key, value] of Object.entries(sessionStorageParsed)) {
                                window.sessionStorage.setItem(key, value);
                            }
                        })();`;
                    };
                    const finalCodePart = `(() => {
                        window.location.assign("./${PROVIDER_REPO_MAP[repoType].basePath}")
                    })();`;
                    const prependCodeParts: string[] = [];
                    if (savedSessionData?.clientSession) {
                        prependCodeParts.push(...[
                            generateSessionStoragePatchingCode(savedSessionData?.clientSession.sessionStorage),
                            `(() => {
                                const windowNameStr = ${JSON.stringify(JSON.stringify(savedSessionData?.clientSession.windowName))};
                                window.name = windowNameStr;
                            })();`,
                        ]);
                    }
                    if (savedSessionData?.sessionStoragePatch) {
                        prependCodeParts.push(generateSessionStoragePatchingCode(savedSessionData?.sessionStoragePatch));
                    }

                    if (prependCodeParts.length) {
                        return `
                            ${prependCodeParts.join("\n\r")};
                            ${finalCodePart}
                        `;
                    }

                    return `
                        window.name = "";
                        window.sessionStorage.clear();
                        ${finalCodePart}
                    `;
                })();

                try {
                    logger.verbose("executeJavaScript");
                    await webView.executeJavaScript(javaScriptCode);
                } catch (error) {
                    const baseMessage = `Failed to set shared session object on "${loaderSrc}" page ("executeJavaScript")`;
                    if (BUILD_ENVIRONMENT === "development") {
                        console.log(baseMessage, error); // eslint-disable-line no-console
                    }
                    // not showing/logging the original error as it might contain sensitive stuff
                    throw new Error(baseMessage);
                }
            })(),
        ]);
    }

    openSettingsView(): void {
        this.store.dispatch(
            NAVIGATION_ACTIONS.Go({
                path: [{outlets: {[SETTINGS_OUTLET]: SETTINGS_PATH}}],
            }),
        );
    }

    logOut(skipKeytarProcessing?: boolean): void {
        this.store.dispatch(NAVIGATION_ACTIONS.Logout({skipKeytarProcessing}));
    }

    dispatch(action: Action): void {
        this.zone.run(() => this.store.dispatch(action));
    }

    fireSyncingIteration({login}: Pick<AccountConfig, "login">): import("rxjs").Observable<never> {
        setTimeout(() => FIRE_SYNCING_ITERATION$.next({login}));

        return concat(
            // first should start new syncing iteration
            this.actions$.pipe(
                ofType(ACCOUNTS_ACTIONS.PatchProgress),
                filter(({payload}) => payload.login === login && Boolean(payload.patch.syncing)),
                take(1),
            ),
            // then should successfully complete the syncing iteration
            this.actions$.pipe(
                ofType(ACCOUNTS_ACTIONS.Synced),
                filter(({payload}) => payload.pk.login === login),
                take(1),
            ),
        ).pipe(
            mergeMap(() => EMPTY),
        );
    }
}
