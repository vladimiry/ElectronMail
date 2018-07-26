import {map, take} from "rxjs/operators";
import {Component, OnInit} from "@angular/core";
import {AbstractControl, FormControl, FormGroup, Validators} from "@angular/forms";
import {Store} from "@ngrx/store";

import {BaseConfig} from "src/shared/model/options";
import {LOG_LEVELS} from "src/shared/constants";
import {NAVIGATION_ACTIONS} from "../store/actions";
import {OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/options";

@Component({
    selector: "email-securely-app-base-settings",
    templateUrl: "./base-settings.component.html",
    preserveWhitespaces: true,
})
export class BaseSettingsComponent implements OnInit {
    baseConfig$ = this.store.select(OptionsSelectors.CONFIG.base);
    processing$ = this.store.select(OptionsSelectors.FEATURED.progress).pipe(map((p) => p.updatingBaseSettings));
    logLevels = LOG_LEVELS;
    controls: Record<keyof BaseConfig, AbstractControl> = {
        closeToTray: new FormControl(),
        compactLayout: new FormControl(),
        startMinimized: new FormControl(),
        unreadNotifications: new FormControl(),
        checkForUpdatesAndNotify: new FormControl(),
        logLevel: new FormControl(null, Validators.required),
    };
    form = new FormGroup(this.controls);

    constructor(private store: Store<State>) {}

    ngOnInit() {
        this.baseConfig$
            .pipe(take(1))
            .subscribe((data) => {
                this.form.patchValue(data);
            });

        this.form.valueChanges.subscribe(() => {
            this.store.dispatch(OPTIONS_ACTIONS.PatchBaseSettingsRequest(this.form.getRawValue()));
        });
    }

    openSettingsFolder(event: Event) {
        event.preventDefault();
        event.stopPropagation();
        this.store.dispatch(NAVIGATION_ACTIONS.OpenSettingsFolder());
    }
}
