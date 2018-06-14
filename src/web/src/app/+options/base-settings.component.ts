import {map, take} from "rxjs/operators";
import {Component, OnInit} from "@angular/core";
import {AbstractControl, FormControl, FormGroup} from "@angular/forms";
import {Store} from "@ngrx/store";

import {BaseConfig} from "_shared/model/options";
import {OptionsActions} from "_web_src/app/store/actions";
import {baseConfigSelector, progressSelector, State} from "_web_src/app/store/reducers/options";

@Component({
    selector: `protonmail-desktop-app-base-settings`,
    templateUrl: "./base-settings.component.html",
})
export class BaseSettingsComponent implements OnInit {
    baseConfig$ = this.store.select(baseConfigSelector);
    processing$ = this.store.select(progressSelector)
        .pipe(map(({updatingBaseSettings}) => updatingBaseSettings));
    controls: Record<keyof BaseConfig, AbstractControl> = {
        closeToTray: new FormControl(),
        compactLayout: new FormControl(),
        startMinimized: new FormControl(),
        unreadNotifications: new FormControl(),
        checkForUpdatesAndNotify: new FormControl(),
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
            this.store.dispatch(new OptionsActions.PatchBaseSettingsRequest(this.form.getRawValue()));
        });
    }
}
