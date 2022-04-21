import {AbstractControl, FormControl, FormGroup, Validators} from "@angular/forms";
import {Component, ElementRef, Inject} from "@angular/core";
import {distinctUntilChanged, distinctUntilKeyChanged, first, map} from "rxjs/operators";
import {Observable, Subscription} from "rxjs";
import type {OnDestroy, OnInit} from "@angular/core";
import {select, Store} from "@ngrx/store";

import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {BaseConfig} from "src/shared/model/options";
import {getWebLogger} from "src/web/browser-window/util";
import {LAYOUT_MODES, LOG_LEVELS, ZOOM_FACTORS} from "src/shared/constants";
import {NAVIGATION_ACTIONS, OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {PACKAGE_GITHUB_PROJECT_URL_TOKEN} from "src/web/browser-window/app/app.constants";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Component({
    selector: "electron-mail-base-settings",
    templateUrl: "./base-settings.component.html",
    styleUrls: ["./base-settings.component.scss"],
    preserveWhitespaces: true,
})
export class BaseSettingsComponent implements OnInit, OnDestroy {
    readonly userDataDir = __METADATA__.electronLocations.userDataDir;

    readonly logLevels = LOG_LEVELS.map((value) => ({title: value.charAt(0).toUpperCase() + value.slice(1), value}));

    readonly layoutModes = [...LAYOUT_MODES];

    readonly themeSources = [
        {value: "system", title: "Follow OS"},
        {value: "dark", title: "Dark"},
        {value: "light", title: "Light"},
    ];

    readonly idleTimeLogOutSecValues: Array<Readonly<{ title: string; valueSec: number }>> = [
        {title: "Disabled", valueSec: 0},
        {title: "3 minutes", valueSec: 60 * 3},
        {title: "5 minutes", valueSec: 60 * 5},
        {title: "10 minutes", valueSec: 60 * 10},
        {title: "15 minutes", valueSec: 60 * 15},
        {title: "20 minutes", valueSec: 60 * 20},
        {title: "25 minutes", valueSec: 60 * 25},
        {title: "30 minutes", valueSec: 60 * 30},
    ];

    readonly zoomFactors = ZOOM_FACTORS.map((zoomLevel) => ({value: zoomLevel, title: `${Math.round(zoomLevel * 100)}%`}));

    readonly controls: Record<keyof BaseConfig, AbstractControl> = {
        doNotRenderNotificationBadgeValue: new FormControl(),
        checkUpdateAndNotify: new FormControl(),
        hideOnClose: new FormControl(),
        layoutMode: new FormControl(),
        customTrayIconColor: new FormControl(),
        customTrayIconSize: new FormControl(),
        customTrayIconSizeValue: new FormControl(),
        customUnreadBgColor: new FormControl(),
        customUnreadTextColor: new FormControl(),
        disableNotLoggedInTrayIndication: new FormControl(),
        disableSpamNotifications: new FormControl(),
        enableHideControlsHotkey: new FormControl(),
        findInPage: new FormControl(),
        fullTextSearch: new FormControl(),
        hideControls: new FormControl(),
        idleTimeLogOutSec: new FormControl(),
        logLevel: new FormControl(
            null,
            Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
        ),
        startHidden: new FormControl(),
        themeSource: new FormControl(),
        unreadNotifications: new FormControl(),
        zoomFactor: new FormControl(),
        calendarNotification: new FormControl(),
    };

    readonly form = new FormGroup(this.controls);

    readonly colorPickerOpened: { bg: boolean; text: boolean; icon: boolean } = {bg: false, text: false, icon: false};

    readonly $trayIconColor: Observable<string>;
    readonly $unreadBgColor: Observable<string>;
    readonly $unreadTextColor: Observable<string>;
    readonly $unreadSummary: Observable<number>;
    readonly localStoreInUse$: Observable<boolean>;

    private readonly logger = getWebLogger(__filename, nameof(BaseSettingsComponent));

    private readonly subscription = new Subscription();

    constructor(
        @Inject(PACKAGE_GITHUB_PROJECT_URL_TOKEN)
        public readonly PACKAGE_GITHUB_PROJECT_URL: string,
        private readonly store: Store<State>,
        private readonly elementRef: ElementRef,
    ) {
        this.$trayIconColor = this.store.pipe(select(OptionsSelectors.CONFIG.trayIconColor));
        this.$unreadBgColor = this.store.pipe(select(OptionsSelectors.CONFIG.unreadBgColor));
        this.$unreadTextColor = this.store.pipe(select(OptionsSelectors.CONFIG.unreadTextColor));
        this.$unreadSummary = this.store.pipe(
            select(AccountsSelectors.ACCOUNTS.loggedInAndUnreadSummary),
            map(({unread}) => unread),
        );
        this.localStoreInUse$ = this.store.pipe(
            select(AccountsSelectors.FEATURED.accounts),
            map((accounts) => accounts.some((account) => account.accountConfig.database)),
            distinctUntilChanged(),
        );
    }

    ngOnInit(): void {
        this.subscription.add({
            unsubscribe: __ELECTRON_EXPOSURE__
                .registerDocumentClickEventListener(
                    this.elementRef.nativeElement,
                    this.logger,
                )
                .unsubscribe,
        });

        this.subscription.add(
            this.store.select(OptionsSelectors.CONFIG.base)
                .pipe(first())
                .subscribe((data) => {
                    this.form.patchValue(data);
                    if (BUILD_DISABLE_START_HIDDEN_FEATURE) {
                        this.controls.startHidden.disable();
                    }
                    if (BUILD_DISABLE_CLOSE_TO_TRAY_FEATURE) {
                        this.controls.hideOnClose.disable();
                    }
                }),
        );

        this.subscription.add(
            this.store.pipe(
                select(OptionsSelectors.CONFIG.zoomFactorDisabled),
            ).subscribe((zoomFactorDisabled) => {
                this.controls.zoomFactor[zoomFactorDisabled ? "disable" : "enable"]();
            }),
        );

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
                    OPTIONS_ACTIONS.PatchBaseSettingsRequest(
                        this.form.getRawValue(), // eslint-disable-line @typescript-eslint/no-unsafe-argument
                    ),
                );
            }),
        );
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    trayIconColorPickerChangeHandler(color: string): void {
        this.controls.customTrayIconColor.patchValue(color);
    }

    bgColorPickerChangeHandler(color: string): void {
        this.controls.customUnreadBgColor.patchValue(color);
    }

    textColorPickerChangeHandler(color: string): void {
        this.controls.customUnreadTextColor.patchValue(color);
    }

    openSettingsFolder(): void {
        this.store.dispatch(NAVIGATION_ACTIONS.OpenSettingsFolder());
    }
}
