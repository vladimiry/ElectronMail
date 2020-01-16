import {Injectable, NgZone} from "@angular/core";
import {Store} from "@ngrx/store";

import {AppAction, NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {PROVIDER_REPOS} from "src/shared/constants";
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
        repoType: keyof typeof PROVIDER_REPOS,
    ): Readonly<{ entryUrl: string; entryApiUrl: string; }> {
        const entryApiUrl = config.entryUrl;

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
