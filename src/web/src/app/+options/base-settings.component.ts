import {map, take} from "rxjs/operators";
import {Component, OnInit} from "@angular/core";
import {FormControl, FormGroup, AbstractControl} from "@angular/forms";
import {Store} from "@ngrx/store";

import {BaseConfig} from "_shared/model/options";
import {OptionsActions} from "_web_app/store/actions";
import {baseConfigSelector, progressSelector, State} from "_web_app/store/reducers/options";

@Component({
    selector: `protonmail-desktop-app-base-settings`,
    templateUrl: "./base-settings.component.html",
    styleUrls: ["./base-settings.component.scss"],
})
export class BaseSettingsComponent implements OnInit {
    baseConfig$ = this.store.select(baseConfigSelector);
    processing$ = this.store.select(progressSelector)
        .pipe(map(({updatingBaseSettings}) => updatingBaseSettings));
    controls: Record<keyof BaseConfig, AbstractControl> = {
        closeToTray: new FormControl(false),
        compactLayout: new FormControl(false),
        startMinimized: new FormControl(false),
        unreadNotifications: new FormControl(false),
        checkForUpdatesAndNotify: new FormControl(false),
    };
    form = new FormGroup(this.controls);

    constructor(private store: Store<State>) {}

    submit() {
        this.store.dispatch(new OptionsActions.PatchBaseSettingsRequest(this.form.getRawValue()));
    }

    ngOnInit() {
        this.baseConfig$
            .pipe(take(1))
            .subscribe((data) => {
                this.form.patchValue(data);
            });
    }
}
