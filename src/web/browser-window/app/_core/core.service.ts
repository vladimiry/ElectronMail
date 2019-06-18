import {Injectable} from "@angular/core";
import {Store} from "@ngrx/store";

import {ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX} from "src/shared/constants";
import {ElectronContextLocations} from "src/shared/model/electron";
import {NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/browser-window/app/app.constants";
import {State} from "src/web/browser-window/app/store/reducers/root";
import {WebAccount} from "src/web/browser-window/app/model";

@Injectable()
export class CoreService {
    constructor(
        private store: Store<State>,
    ) {}

    parseEntryUrl(
        config: WebAccount["accountConfig"],
        {webClients}: ElectronContextLocations,
    ): { entryUrl: string; entryApiUrl: string; } {
        if (!config.entryUrl.startsWith(ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX)) {
            return {
                entryUrl: config.entryUrl,
                entryApiUrl: config.entryUrl,
            };
        }

        const entryApiUrl = config.entryUrl.split(ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX).pop();
        if (!entryApiUrl || !entryApiUrl.startsWith("https://")) {
            throw new Error(`Invalid "entryApiUrl" value: "${entryApiUrl}"`);
        }

        const entryUrl = webClients[config.type]
            .filter((webClient) => webClient.entryApiUrl === entryApiUrl)
            .map((webClient) => webClient.entryUrl)
            .pop();
        if (!entryUrl) {
            throw new Error(`Invalid "entryUrl" value: "${entryUrl}"`);
        }

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
}
