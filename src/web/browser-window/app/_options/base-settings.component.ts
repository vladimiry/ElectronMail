import {AbstractControl, FormControl, FormGroup, Validators} from "@angular/forms";
import {Component, OnDestroy, OnInit} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {Subscription} from "rxjs";
import {distinctUntilChanged, distinctUntilKeyChanged, map, take} from "rxjs/operators";

import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {BaseConfig} from "src/shared/model/options";
import {LOG_LEVELS} from "src/shared/constants";
import {NAVIGATION_ACTIONS, OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Component({
    selector: "electron-mail-base-settings",
    templateUrl: "./base-settings.component.html",
    styleUrls: ["./base-settings.component.scss"],
    preserveWhitespaces: true,
})
export class BaseSettingsComponent implements OnInit, OnDestroy {
    processing$ = this.store
        .select(OptionsSelectors.FEATURED.progress)
        .pipe(map((p) => p.updatingBaseSettings));

    fullTextSearchDisabled$ = this.store
        .select(OptionsSelectors.SETTINGS.localStoreEnabledCount)
        .pipe(
            distinctUntilChanged(),
            map((value) => value < 1),
        );

    logLevels = LOG_LEVELS;

    appearanceBlockCollapsed: boolean = true;

    controls: Record<keyof BaseConfig, AbstractControl> = {
        checkUpdateAndNotify: new FormControl(),
        closeToTray: new FormControl(),
        compactLayout: new FormControl(),
        customTrayIconColor: new FormControl(),
        customUnreadBgColor: new FormControl(),
        customUnreadTextColor: new FormControl(),
        disableSpamNotifications: new FormControl(),
        findInPage: new FormControl(),
        fullTextSearch: new FormControl(),
        hideControls: new FormControl(),
        logLevel: new FormControl(null, Validators.required),
        startMinimized: new FormControl(),
        unreadNotifications: new FormControl(),
    };

    form = new FormGroup(this.controls);

    colorPickerOpened: { bg: boolean; text: boolean; icon: boolean; } = {bg: false, text: false, icon: false};

    $trayIconColor = this.store.pipe(select(OptionsSelectors.CONFIG.trayIconColor));

    $unreadBgColor = this.store.pipe(select(OptionsSelectors.CONFIG.unreadBgColor));

    $unreadTextColor = this.store.pipe(select(OptionsSelectors.CONFIG.unreadTextColor));

    $unreadSummary = this.store.select(AccountsSelectors.ACCOUNTS.loggedInAndUnreadSummary).pipe(
        map(({unread}) => unread),
    );

    private subscription = new Subscription();

    constructor(
        private store: Store<State>,
    ) {}

    ngOnInit() {
        this.store.select(OptionsSelectors.CONFIG.base)
            .pipe(take(1))
            .subscribe((data) => this.form.patchValue(data));

        this.subscription.add(
            this.store
                .select(OptionsSelectors.FEATURED.config)
                .pipe(
                    distinctUntilKeyChanged("_rev"),
                    distinctUntilKeyChanged("hideControls"),
                )
                .subscribe(({hideControls}) => {
                    this.controls.hideControls.patchValue(hideControls);
                }),
        );

        this.subscription.add(
            this.form.valueChanges.subscribe(() => {
                this.store.dispatch(
                    OPTIONS_ACTIONS.PatchBaseSettingsRequest(this.form.getRawValue()),
                );
            }),
        );
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }

    trayIconColorPickerChangeHandler(color: string) {
        this.controls.customTrayIconColor.patchValue(color);
    }

    bgColorPickerChangeHandler(color: string) {
        this.controls.customUnreadBgColor.patchValue(color);
    }

    textColorPickerChangeHandler(color: string) {
        this.controls.customUnreadTextColor.patchValue(color);
    }

    openSettingsFolder(event: Event) {
        event.preventDefault();
        this.store.dispatch(NAVIGATION_ACTIONS.OpenSettingsFolder());
    }
}
