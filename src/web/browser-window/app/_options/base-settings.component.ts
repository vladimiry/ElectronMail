import {AbstractControl, FormControl, FormGroup, Validators} from "@angular/forms";
import {Component, ElementRef, Inject, OnDestroy, OnInit} from "@angular/core";
import {Observable, Subscription} from "rxjs";
import {Store, select} from "@ngrx/store";
import {distinctUntilChanged, distinctUntilKeyChanged, map, take} from "rxjs/operators";

import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {BaseConfig} from "src/shared/model/options";
import {LAYOUT_MODES, LOG_LEVELS, ZOOM_FACTORS} from "src/shared/constants";
import {NAVIGATION_ACTIONS, OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {PACKAGE_GITHUB_PROJECT_URL_TOKEN} from "src/web/browser-window/app/app.constants";
import {State} from "src/web/browser-window/app/store/reducers/options";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";

@Component({
    selector: "electron-mail-base-settings",
    templateUrl: "./base-settings.component.html",
    styleUrls: ["./base-settings.component.scss"],
    preserveWhitespaces: true,
})
export class BaseSettingsComponent implements OnInit, OnDestroy {
    readonly processing$: Observable<boolean> = this.store.pipe(
        select(OptionsSelectors.FEATURED.progress),
        map((progress) => Boolean(progress.updatingBaseSettings)),
    );

    readonly logLevels = [...LOG_LEVELS];

    readonly layoutModes = [...LAYOUT_MODES];

    readonly idleTimeLogOutSecValues: Array<Readonly<{ title: string; valueSec: number }>> = [
        {title: "disabled", valueSec: 0},
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
        customUnreadBgColor: new FormControl(),
        customUnreadTextColor: new FormControl(),
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
        unreadNotifications: new FormControl(),
        zoomFactor: new FormControl(),
        calendarNotification: new FormControl(),
    };

    readonly form = new FormGroup(this.controls);

    readonly colorPickerOpened: { bg: boolean; text: boolean; icon: boolean } = {bg: false, text: false, icon: false};

    readonly $trayIconColor = this.store.pipe(select(OptionsSelectors.CONFIG.trayIconColor));

    readonly $unreadBgColor = this.store.pipe(select(OptionsSelectors.CONFIG.unreadBgColor));

    readonly $unreadTextColor = this.store.pipe(select(OptionsSelectors.CONFIG.unreadTextColor));

    readonly $unreadSummary = this.store.pipe(
        select(AccountsSelectors.ACCOUNTS.loggedInAndUnreadSummary),
        map(({unread}) => unread),
    );

    readonly localStoreInUse$: Observable<boolean> = this.store.pipe(
        select(AccountsSelectors.FEATURED.accounts),
        map((accounts) => accounts.some((account) => account.accountConfig.database)),
        distinctUntilChanged(),
    );

    private readonly logger = getZoneNameBoundWebLogger();

    private readonly subscription = new Subscription();

    constructor(
        @Inject(PACKAGE_GITHUB_PROJECT_URL_TOKEN)
        public readonly PACKAGE_GITHUB_PROJECT_URL: string,
        private readonly store: Store<State>,
        private readonly elementRef: ElementRef,
    ) {}

    ngOnInit(): void {
        this.subscription.add({
            unsubscribe: __ELECTRON_EXPOSURE__
                .registerDocumentClickEventListener(
                    this.elementRef.nativeElement,
                    this.logger,
                )
                .unsubscribe,
        });

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
