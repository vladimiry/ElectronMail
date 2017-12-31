import {map, take} from "rxjs/operators";
import {Component, OnInit} from "@angular/core";
import {FormControl, FormGroup} from "@angular/forms";
import {Store} from "@ngrx/store";

import {baseConfigSelector, progressSelector, State} from "_web_app/store/reducers/options";
import {OptionsActions} from "_web_app/store/actions";

@Component({
    selector: `protonmail-desktop-app-base-settings`,
    templateUrl: "./base-settings.component.html",
    styleUrls: ["./base-settings.component.scss"],
})
export class BaseSettingsComponent implements OnInit {
    baseConfig$ = this.store.select(baseConfigSelector);
    processing$ = this.store.select(progressSelector)
        .pipe(map(({updatingBaseSettings}) => updatingBaseSettings));
    // form
    closeToTray = new FormControl(false);
    compactLayout = new FormControl(false);
    startMinimized = new FormControl(false);
    unreadNotifications = new FormControl(false);
    form = new FormGroup({
        closeToTray: this.closeToTray,
        compactLayout: this.compactLayout,
        startMinimized: this.startMinimized,
        unreadNotifications: this.unreadNotifications,
    });

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
