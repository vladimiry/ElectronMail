import {AfterViewInit, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren} from "@angular/core";
import {FormControl, Validators} from "@angular/forms";
import {Observable, Subject, Subscription} from "rxjs";
import {Store, select} from "@ngrx/store";
import {map, takeUntil} from "rxjs/operators";

import {NAVIGATION_ACTIONS, OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {ONE_SECOND_MS, PACKAGE_NAME} from "src/shared/constants";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/options";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";

export abstract class LoginBaseComponent implements AfterViewInit, OnInit, OnDestroy {
    projectName = PACKAGE_NAME;

    keytarUnsupportedDetails: boolean = false;

    password = new FormControl(null, Validators.required);

    savePassword = new FormControl(false);

    signingIn$: Observable<boolean> = this.store.pipe(
        select(OptionsSelectors.FEATURED.progress),
        map((progress) => Boolean(progress.signingIn)),
    );

    loadingDatabase$: Observable<boolean> = this.store.pipe(
        select(OptionsSelectors.FEATURED.progress),
        map((progress) => Boolean(progress.loadingDatabase)),
    );

    databaseLoadingTimeoutSeconds$ = this.store.pipe(
        select(OptionsSelectors.FEATURED.config),
        map((config) => (config.timeouts.databaseLoading || 0) / ONE_SECOND_MS),
    );

    keytarSupport$ = this.store.pipe(
        select(OptionsSelectors.FEATURED.keytarSupport),
    );

    snapPasswordManagerServiceHint$ = this.store.pipe(
        select(OptionsSelectors.FEATURED.snapPasswordManagerServiceHint),
    );

    @ViewChildren("passwordRef")
    passwordElementRefQuery!: QueryList<ElementRef>;

    protected unSubscribe$ = new Subject();
    private readonly subscription = new Subscription();
    private readonly logger = getZoneNameBoundWebLogger();

    constructor(
        protected store: Store<State>,
        protected elementRef: ElementRef,
    ) {}

    ngOnInit() {
        this.subscription.add({
            unsubscribe: __ELECTRON_EXPOSURE__
                .registerDocumentClickEventListener(
                    this.elementRef.nativeElement,
                    this.logger,
                )
                .unsubscribe,
        });

        this.keytarSupport$
            .pipe(
                takeUntil(this.unSubscribe$),
            )
            .subscribe((value) => this.savePassword[value ? "enable" : "disable"]());
    }

    ngAfterViewInit() {
        if (this.passwordElementRefQuery.length) {
            this.passwordElementRefQuery.first.nativeElement.focus();
        }
    }

    submit() {
        this.store.dispatch(OPTIONS_ACTIONS.SignInRequest({
            password: String(this.password.value),
            savePassword: Boolean(this.savePassword.value),
        }));
    }

    openSettingsFolder(event: Event) {
        event.preventDefault();
        this.store.dispatch(NAVIGATION_ACTIONS.OpenSettingsFolder());
    }

    toggleKeytarUnsupportedDetails(event: Event) {
        event.preventDefault();
        this.keytarUnsupportedDetails = !this.keytarUnsupportedDetails;

    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
        this.subscription.unsubscribe();
    }
}
