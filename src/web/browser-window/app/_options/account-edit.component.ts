import {AbstractControl, FormControl, FormGroup, Validators} from "@angular/forms";
import {ActivatedRoute} from "@angular/router";
import {Component, ElementRef, OnDestroy, OnInit} from "@angular/core";
import {Observable, Subscription, merge} from "rxjs";
import {Store, select} from "@ngrx/store";
import {concatMap, distinctUntilChanged, map, mergeMap} from "rxjs/operators";

import {ACCOUNTS_CONFIG, ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX} from "src/shared/constants";
import {AccountConfig, AccountConfigProtonmail, AccountType} from "src/shared/model/account";
import {AccountConfigCreatePatch, AccountConfigUpdatePatch} from "src/shared/model/container";
import {EntryUrlItem} from "src/shared/model/common";
import {OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/options";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";
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
    typeValues: Array<{ value: AccountType; title: string; }> = [
        {value: "protonmail", title: "ProtonMail"},
    ];
    entryUrlItems: EntryUrlItem[] = [];
    controls: Record<keyof Pick<AccountConfig,
        | "type" | "login" | "title" | "database" | "entryUrl" | "loginDelayUntilSelected" | "loginDelaySecondsRange">
        | keyof Pick<Required<Required<AccountConfig>["proxy"]>, "proxyRules" | "proxyBypassRules">
        | keyof AccountConfigProtonmail["credentials"],
        AbstractControl> = {
        type: new FormControl(this.typeValues[0].value, Validators.required),
        login: new FormControl(null, Validators.required),
        title: new FormControl(null),
        database: new FormControl(null),
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
            unsubscribe: __ELECTRON_EXPOSURE__
                .registerDocumentClickEventListener(
                    this.elementRef.nativeElement,
                    this.logger,
                )
                .unsubscribe,
        });

        this.subscription.add(
            this.account$.subscribe((account) => {
                this.account = account;

                this.form.removeControl(((name: keyof Pick<typeof AccountEditComponent.prototype.controls, "login">) => name)("login"));

                (() => {
                    controls.type.patchValue(account.type);
                    controls.title.patchValue(account.title);
                    controls.database.patchValue(account.database);
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

        this.subscription.add(
            controls.type.valueChanges.subscribe(this.typeChangeReaction.bind(this)),
        );

        this.typeChangeReaction(controls.type.value);
    }

    typeChangeReaction(type: AccountType) {
        const {entryUrl: entryUrlControl} = this.controls;

        this.entryUrlItems = ACCOUNTS_CONFIG[type].entryUrl;

        if (entryUrlControl.value && !this.entryUrlItems.some(({value}) => value === entryUrlControl.value)) {
            entryUrlControl.patchValue(null);
        }
    }

    submit() {
        const {controls} = this;
        const account = this.account;
        const proxy: AccountConfig<AccountType>["proxy"] = {
            proxyRules: controls.proxyRules.value && controls.proxyRules.value.trim(),
            proxyBypassRules: controls.proxyBypassRules.value && controls.proxyBypassRules.value.trim(),
        };
        const patch: Readonly<AccountConfigUpdatePatch> = {
            login: account
                ? account.login :
                controls.login.value,
            title: controls.title.value,
            entryUrl: controls.entryUrl.value,
            database: Boolean(controls.database.value),
            credentials: {
                password: controls.password.value,
                twoFactorCode: controls.twoFactorCode.value,
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
        const accountType: AccountType = account
            ? account.type
            : controls.type.value;

        if (accountType === "protonmail") {
            // TODO ger rid of "TS as" casting
            (patch as AccountConfigProtonmail).credentials.mailPassword = controls.mailPassword.value;
        }

        this.store.dispatch(account
            ? OPTIONS_ACTIONS.UpdateAccountRequest(patch)
            : OPTIONS_ACTIONS.AddAccountRequest({...patch, type: controls.type.value} as AccountConfigCreatePatch),
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

    isLocalWebClient({value}: EntryUrlItem): boolean {
        return value.startsWith(ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX);
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }
}
