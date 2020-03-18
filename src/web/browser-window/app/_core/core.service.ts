import UUID from "pure-uuid";
import {Injectable, NgZone} from "@angular/core";
import {Observable} from "rxjs/internal/Observable";
import {Store, select} from "@ngrx/store";
import {filter, first, take, takeUntil} from "rxjs/operators";
import {timer} from "rxjs";

import {AppAction, NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {PROVIDER_REPOS, WEB_CLIENTS_BLANK_HTML_FILE_NAME, WEB_VIEW_SESSION_STORAGE_KEY_SKIP_LOGIN_DELAYS} from "src/shared/constants";
import {ProtonClientSession} from "src/shared/model/proton";
import {SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/browser-window/app/app.constants";
import {State} from "src/web/browser-window/app/store/reducers/root";
import {WebAccount} from "src/web/browser-window/app/model";

@Injectable()
export class CoreService {
    constructor(
        private store: Store<State>,
        private zone: NgZone,
    ) {}

    parseEntryUrl(
        accountConfig: WebAccount["accountConfig"],
        repoType: keyof typeof PROVIDER_REPOS,
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
        const {baseDir} = PROVIDER_REPOS[repoType];
        const entryUrl = `${bundle.entryUrl}${baseDir ? "/" + baseDir : ""}`;

        return {
            entryUrl,
            entryApiUrl,
        };
    }

    // TODO move method to "_accounts/*.service"
    async initProtonClientSessionAndNavigate(
        accountConfig: WebAccount["accountConfig"],
        repoType: keyof typeof PROVIDER_REPOS,
        webViewDomReady$: Observable<Electron.WebviewTag>,
        setWebViewSrc: (src: string) => void,
        clientSession?: ProtonClientSession,
    ): Promise<void> {
        const {webViewBlankDOMLoaded: loaderIdTimeoutMs} = await this.store
            .pipe(
                select(OptionsSelectors.CONFIG.timeouts),
                take(1),
            )
            .toPromise();
        const loaderId = new UUID(4).format();
        const loaderIdParam = "loader-id";
        const loaderSrcOrigin = new URL(this.parseEntryUrl(accountConfig, repoType).entryUrl).origin;
        const loaderSrc = `${loaderSrcOrigin}/${WEB_CLIENTS_BLANK_HTML_FILE_NAME}?${loaderIdParam}=${loaderId}`;
        let webView: Electron.WebviewTag | undefined;

        setTimeout(() => {
            this.zone.run(() => {
                setWebViewSrc(loaderSrc);
            });
        });

        try {
            webView = await webViewDomReady$.pipe(
                filter(({src}) => !!src && new URL(src).searchParams.get(loaderIdParam) === loaderId),
                takeUntil(timer(loaderIdTimeoutMs)),
                first(), // "first()" throws error if stream closed without any event passed through
            ).toPromise();
        } catch {
            throw new Error(`Failed to load "${loaderSrc}" page in ${loaderIdTimeoutMs}ms`);
        }

        const javaScriptCode = (() => {
            const finalCodePart = `
                window.sessionStorage.setItem(${JSON.stringify(WEB_VIEW_SESSION_STORAGE_KEY_SKIP_LOGIN_DELAYS)}, 1);
                window.location.assign("./${PROVIDER_REPOS[repoType].baseDir}")
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
            await webView.executeJavaScript(javaScriptCode);
        } catch (error) {
            const baseMessage = `Failed to set shared session object on "${loaderSrc}" page ("executeJavaScript")`;
            if (BUILD_ENVIRONMENT === "development") {
                console.log(baseMessage, error); // eslint-disable-line no-console
            }
            // not showing/logging the original error it might contain sensitive stuff
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
}
