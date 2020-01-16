import {Injectable, NgZone} from "@angular/core";
import {Store} from "@ngrx/store";

import {ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX, PROVIDER_REPOS} from "src/shared/constants";
import {AppAction, NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
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
        config: WebAccount["accountConfig"],
        type: keyof typeof PROVIDER_REPOS,
    ): Readonly<{ entryUrl: string; entryApiUrl: string; }> {
        const entryApiUrl = config.entryUrl.split(ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX).pop();

        if (!entryApiUrl || !entryApiUrl.startsWith("https://")) {
            throw new Error(`Invalid "entryApiUrl" value: "${entryApiUrl}"`);
        }

        const bundle = __METADATA__.electronLocations.webClients
            .filter((webClient) => webClient.entryApiUrl === entryApiUrl)
            .pop();
        if (!bundle) {
            throw new Error(`Invalid "entryUrl" value: "${JSON.stringify(bundle)}"`);
        }
        const {baseDir} = PROVIDER_REPOS[type];
        const entryUrl = `${bundle.entryUrl}${baseDir ? "/" + baseDir : ""}`;

        return {
            entryUrl,
            entryApiUrl,
        };
    }

    openSettingsView() {
        this.store.dispatch(
            NAVIGATION_ACTIONS.Go({
                path: [{outlets: {[SETTINGS_OUTLET]: SETTINGS_PATH}}],
            }),
        );
    }

    logOut() {
        this.store.dispatch(NAVIGATION_ACTIONS.Logout());
    }

    dispatch(action: AppAction) {
        this.zone.run(() => {
            this.store.dispatch(action);
        });
    }
}
