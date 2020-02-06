import {AbstractControl, FormControl, FormGroup, Validators} from "@angular/forms";
import {ActivatedRoute} from "@angular/router";
import {Component, ElementRef, OnDestroy, OnInit} from "@angular/core";
import {Observable, Subscription, merge} from "rxjs";
import {Store, select} from "@ngrx/store";
import {concatMap, distinctUntilChanged, map, mergeMap} from "rxjs/operators";

import {AccountConfig} from "src/shared/model/account";
import {AccountConfigCreateUpdatePatch} from "src/shared/model/container";
import {OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {PROTON_API_ENTRY_RECORDS} from "src/shared/constants";
import {State} from "src/web/browser-window/app/store/reducers/options";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";
import {registerDocumentClickEventListener} from "src/shared-web/events-handling";
import {validateLoginDelaySecondsRange} from "src/shared/util";

@Component({
    selector: "electron-mail-account-edit",
    templateUrl: "./account-edit.component.html",
    styleUrls: ["./account-edit.component.scss"],
    preserveWhitespaces: true,
})
export class AccountEditComponent implements OnInit, OnDestroy {
    // form
    advancedBlockCollapsed: boolean = true;

    entryUrlItems = PROTON_API_ENTRY_RECORDS;
    controls: Record<keyof Pick<AccountConfig,
        | "login" | "title" | "database" | "persistentSession" | "entryUrl" | "loginDelayUntilSelected" | "loginDelaySecondsRange">
        | keyof Pick<Required<Required<AccountConfig>["proxy"]>, "proxyRules" | "proxyBypassRules">
        | keyof AccountConfig["credentials"],
        AbstractControl> = {
        login: new FormControl(null, Validators.required),
        title: new FormControl(null),
        database: new FormControl(null),
        persistentSession: new FormControl(null),
        entryUrl: new FormControl(null, Validators.required),
        proxyRules: new FormControl(null),
        proxyBypassRules: new FormControl(null),
        password: new FormControl(null),
        twoFactorCode: new FormControl(null),
        mailPassword: new FormControl(null),
        loginDelayUntilSelected: new FormControl(null),
        loginDelaySecondsRange: new FormControl(
            null,
            () => {
                const control: AbstractControl | undefined = this.controls && this.controls.loginDelaySecondsRange;
                const value: string | undefined = control && control.value;
                const validated = value && validateLoginDelaySecondsRange(value);

                if (validated && "validationError" in validated) {
                    return {errorMsg: validated.validationError};
                }

                return null;
            },
        ),
    };
    form = new FormGroup(this.controls);
    // account
    account?: AccountConfig;
    account$: Observable<AccountConfig> = merge(this.activatedRoute.params, this.activatedRoute.queryParams).pipe(
        mergeMap(({login}) => login ? [String(login)] : []),
        concatMap((login) => this.store.select(OptionsSelectors.SETTINGS.pickAccount({login}))),
        mergeMap((account) => account ? [account] : []),
    );
    // progress
    processing$: Observable<boolean> = this.store.pipe(
        select(OptionsSelectors.FEATURED.progress),
        map((progress) => Boolean(progress.addingAccount || progress.updatingAccount)),
        distinctUntilChanged(),
    );
    removing$: Observable<boolean> = this.store.pipe(
        select(OptionsSelectors.FEATURED.progress),
        map((progress) => Boolean(progress.removingAccount)),
        distinctUntilChanged(),
    );

    // other
    private readonly logger = getZoneNameBoundWebLogger();
    private readonly subscription = new Subscription();

    constructor(
        private store: Store<State>,
        private activatedRoute: ActivatedRoute,
        private elementRef: ElementRef,
    ) {}

    ngOnInit() {
        const {controls} = this;

        this.subscription.add({
            unsubscribe: registerDocumentClickEventListener(
                __ELECTRON_EXPOSURE__.buildIpcMainClient,
                this.elementRef.nativeElement,
                this.logger,
            ).unsubscribe,
        });

        this.subscription.add(
            this.account$.subscribe((account) => {
                this.account = account;

                this.form.removeControl(((name: keyof Pick<typeof AccountEditComponent.prototype.controls, "login">) => name)("login"));

                (() => {
                    controls.title.patchValue(account.title);
                    controls.database.patchValue(account.database);
                    controls.persistentSession.patchValue(account.persistentSession);
                    controls.entryUrl.patchValue(account.entryUrl);

                    controls.proxyRules.patchValue(account.proxy ? account.proxy.proxyRules : null);
                    controls.proxyBypassRules.patchValue(account.proxy ? account.proxy.proxyBypassRules : null);

                    controls.password.patchValue(account.credentials.password);
                    controls.twoFactorCode.patchValue(account.credentials.twoFactorCode);
                    controls.mailPassword.patchValue(account.credentials.mailPassword);

                    controls.loginDelayUntilSelected.patchValue(account.loginDelayUntilSelected);
                    controls.loginDelaySecondsRange.patchValue(
                        account.loginDelaySecondsRange
                            ? `${account.loginDelaySecondsRange.start}-${account.loginDelaySecondsRange.end}`
                            : undefined,
                    );
                })();
            }),
        );
    }

    submit() {
        const {controls} = this;
        const account = this.account;
        const proxy: AccountConfig["proxy"] = {
            proxyRules: controls.proxyRules.value && controls.proxyRules.value.trim(),
            proxyBypassRules: controls.proxyBypassRules.value && controls.proxyBypassRules.value.trim(),
        };
        const patch: Readonly<AccountConfigCreateUpdatePatch> = {
            login: account
                ? account.login :
                controls.login.value,
            title: controls.title.value,
            entryUrl: controls.entryUrl.value,
            database: Boolean(controls.database.value),
            persistentSession: Boolean(controls.persistentSession.value),
            credentials: {
                password: controls.password.value,
                twoFactorCode: controls.twoFactorCode.value,
                mailPassword: controls.mailPassword.value,
            },
            ...((proxy.proxyRules || proxy.proxyBypassRules) && {proxy}),
            loginDelayUntilSelected: Boolean(controls.loginDelayUntilSelected.value),
            loginDelaySecondsRange: (() => {
                const validated = this.controls.loginDelaySecondsRange.value
                    ? validateLoginDelaySecondsRange(this.controls.loginDelaySecondsRange.value)
                    : undefined;

                if (validated && "validationError" in validated) {
                    throw new Error(validated.validationError);
                }

                return validated;
            })(),
        };

        this.store.dispatch(
            account
                ? OPTIONS_ACTIONS.UpdateAccountRequest(patch)
                : OPTIONS_ACTIONS.AddAccountRequest(patch),
        );
    }

    remove() {
        const account = this.account;

        if (!account) {
            throw new Error(`No "Account" to remove`);
        }

        if (!confirm(`Please confirm "${account.login}" account removing!`)) {
            return;
        }

        this.store.dispatch(OPTIONS_ACTIONS.RemoveAccountRequest(account));
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }
}
