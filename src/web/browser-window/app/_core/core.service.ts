import UUID from "pure-uuid";
import {Actions} from "@ngrx/effects";
import {EMPTY, concat, timer} from "rxjs";
import {Injectable, NgZone} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {URL} from "@cliqz/url-parser";
import {filter, first, mergeMap, take, takeUntil} from "rxjs/operators";

import {ACCOUNTS_ACTIONS, AppAction, NAVIGATION_ACTIONS, unionizeActionFilter} from "src/web/browser-window/app/store/actions";
import {AccountConfig} from "src/shared/model/account";
import {FIRE_SYNCING_ITERATION$, SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/browser-window/app/app.constants";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {PROVIDER_REPO_MAP, WEB_CLIENTS_BLANK_HTML_FILE_NAME, WEB_VIEW_SESSION_STORAGE_KEY_SKIP_LOGIN_DELAYS,} from "src/shared/constants";
import {ProtonClientSession} from "src/shared/model/proton";
import {State} from "src/web/browser-window/app/store/reducers/root";
import {WebAccount} from "src/web/browser-window/app/model";
import {curryFunctionMembers, parseUrlOriginWithNullishCheck} from "src/shared/util";

@Injectable()
export class CoreService {
    constructor(
        private store: Store<State>,
        private zone: NgZone,
        private readonly actions$: Actions<{
            type: string;
            payload: any; // eslint-disable-line @typescript-eslint/no-explicit-any
        }>,
    ) {}

    parseEntryUrl(
        accountConfig: WebAccount["accountConfig"],
        repoType: keyof typeof PROVIDER_REPO_MAP,
    ): Readonly<{ entryUrl: string; entryApiUrl: string }> {
        const entryApiUrl = accountConfig.entryUrl;

        if (!entryApiUrl || !entryApiUrl.startsWith("https://")) {
            throw new Error(`Invalid "entryApiUrl" value: "${entryApiUrl}"`);
        }

        const bundle = __METADATA__.electronLocations.webClients
            .filter((webClient) => webClient.entryApiUrl === entryApiUrl)
            .pop();
        if (!bundle) {
            throw new Error(`Invalid "entryUrl" value: "${JSON.stringify(bundle)}"`);
        }
        const {baseDirName} = PROVIDER_REPO_MAP[repoType];
        const entryUrl = `${bundle.entryUrl}${baseDirName ? "/" + baseDirName : ""}`;

        return {
            entryUrl,
            entryApiUrl,
        };
    }

    // TODO move method to "_accounts/*.service"
    async applyProtonClientSessionAndNavigate(
        accountConfig: WebAccount["accountConfig"],
        repoType: keyof typeof PROVIDER_REPO_MAP,
        webViewDomReady$: import("rxjs").Observable<Electron.WebviewTag>,
        setWebViewSrc: (src: string) => void,
        logger_: import("src/shared/model/common").Logger,
        clientSession?: ProtonClientSession,
    ): Promise<void> {
        const logger = curryFunctionMembers(logger_, "[core.service]", "applyProtonClientSessionAndNavigate");
        const {webViewBlankDOMLoaded: loaderIdTimeoutMs} = await this.store
            .pipe(
                select(OptionsSelectors.CONFIG.timeouts),
                first(),
            )
            .toPromise();
        const loaderId = new UUID(4).format();
        const loaderIdParam = "loader-id";
        const loaderSrcOrigin = parseUrlOriginWithNullishCheck(
            this.parseEntryUrl(accountConfig, repoType).entryUrl,
        );
        const loaderSrc = `${loaderSrcOrigin}/${WEB_CLIENTS_BLANK_HTML_FILE_NAME}?${loaderIdParam}=${loaderId}`;
        let webView: Electron.WebviewTag | undefined;

        logger.verbose("setTimeout");
        setTimeout(() => {
            logger.verbose("this.zone.run");
            this.zone.run(() => { // TODO "setTimeout" already triggers the change detection so "zone.run" call seems redundant
                logger.verbose("setWebViewSrc");
                setWebViewSrc(loaderSrc);
            });
        });

        try {
            logger.verbose("webViewDomReady$");
            webView = await webViewDomReady$.pipe(
                filter(({src}) => {
                    const result = Boolean(src) && new URL(src).searchParams.get(loaderIdParam) === loaderId;
                    logger.verbose("webViewDomReady$ filter", JSON.stringify({src, result}));
                    return result;
                }),
                takeUntil(timer(loaderIdTimeoutMs)),
                first(), // "first()" throws error if stream closed without any event passed through
            ).toPromise();
        } catch (error) {
            const message = `Failed to load "${loaderSrc}" page in ${loaderIdTimeoutMs}ms`;
            logger.error(message, error);
            throw new Error(message);
        }

        const javaScriptCode = (() => {
            const finalCodePart = `
                window.sessionStorage.setItem(${JSON.stringify(WEB_VIEW_SESSION_STORAGE_KEY_SKIP_LOGIN_DELAYS)}, 1);
                window.location.assign("./${PROVIDER_REPO_MAP[repoType].baseDirName}")
            `;

            if (clientSession) {
                return `(() => {
                    const windowNameStr = ${JSON.stringify(JSON.stringify(clientSession.windowName))};
                    const sessionStorageStr = ${JSON.stringify(JSON.stringify(clientSession.sessionStorage))};
                    const sessionStorageParsed = JSON.parse(sessionStorageStr);
                    window.name = windowNameStr;
                    for (const [key, value] of Object.entries(sessionStorageParsed)) {
                        window.sessionStorage.setItem(key, value);
                    }
                    ${finalCodePart}
                })()`;
            }

            return `(() => {
                window.name = "";
                window.sessionStorage.clear();
                ${finalCodePart}
            })()`;
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
    }

    openSettingsView(): void {
        this.store.dispatch(
            NAVIGATION_ACTIONS.Go({
                path: [{outlets: {[SETTINGS_OUTLET]: SETTINGS_PATH}}],
            }),
        );
    }

    logOut(): void {
        this.store.dispatch(NAVIGATION_ACTIONS.Logout());
    }

    dispatch(action: AppAction): void {
        this.zone.run(() => {
            this.store.dispatch(action);
        });
    }

    fireSyncingIteration({login}: Pick<AccountConfig, "login">): import("rxjs").Observable<never> {
        setTimeout(() => FIRE_SYNCING_ITERATION$.next({login}));

        return concat(
            // first should start new syncing iteration
            this.actions$.pipe(
                unionizeActionFilter(ACCOUNTS_ACTIONS.is.PatchProgress),
                filter(({payload}) => payload.login === login && Boolean(payload.patch.syncing)),
                take(1),
            ),
            // then should successfully complete the syncing iteration
            this.actions$.pipe(
                unionizeActionFilter(ACCOUNTS_ACTIONS.is.Synced),
                filter(({payload}) => payload.pk.login === login),
                take(1),
            ),
        ).pipe(
            mergeMap(() => EMPTY),
        );
    }
}
