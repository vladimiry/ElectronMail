import {Component} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {map, take} from "rxjs/operators";

import {FEATURED} from "src/web/src/app/store/selectors/options";
import {NAVIGATION_ACTIONS, OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {OptionsService} from "src/web/src/app/_options/options.service";
import {State} from "src/web/src/app/store/reducers/options";

@Component({
    selector: "electron-mail-migrating",
    templateUrl: "./migrating.component.html",
    styleUrls: ["./migrating.component.scss"],
})
export class MigratingComponent {
    migrating$ = this.store.pipe(
        select(FEATURED.progress),
        map((progress) => progress.migrating),
    );

    copyV2App$ = this.store.pipe(
        select(FEATURED.copyV2AppData),
        map((value) => {
            if (typeof value === "undefined") {
                throw new Error(`"copyV2AppData" is supposed to be initialized at this stage`);
            }
            return {
                keys: Object.keys(value),
                data: value,
            };
        }),
    );

    constructor(
        private store: Store<State>,
        private optionsService: OptionsService,
    ) {}

    migrate() {
        this.copyV2App$
            .pipe(take(1))
            .subscribe(({data}) => this.store.dispatch(OPTIONS_ACTIONS.Migrate(data)));
    }

    continue() {
        this.store.dispatch(this.optionsService.settingsNavigationAction({path: ""}));
    }

    openProjectReadme() {
        this.store.dispatch(NAVIGATION_ACTIONS.OpenExternal({
            url: "https://github.com/vladimiry/ElectronMail/blob/master/README.md",
        }));
    }
}
