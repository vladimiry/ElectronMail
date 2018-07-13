import {ActivatedRoute} from "@angular/router";
import {Component, OnDestroy, OnInit} from "@angular/core";
import {EMPTY, merge, Observable, of, Subject} from "rxjs";
import {filter, map, switchMap, takeUntil, withLatestFrom} from "rxjs/operators";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {Store} from "@ngrx/store";

import {
    progressSelector,
    settingsAccountByLoginSelector,
    settingsKeePassClientConfSelector,
    State,
} from "src/web/src/app/store/reducers/options";
import {AccountConfig, AccountConfigByType, AccountType} from "src/shared/model/account";
import {AccountConfigCreatePatch, AccountConfigPatch, AccountConfigPatchByType} from "src/shared/model/container";
import {ACCOUNTS_CONFIG, EntryUrlItem} from "src/shared/constants";
import {KeePassRef} from "src/shared/model/keepasshttp";
import {OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {OptionsService} from "./options.service";

// TODO simplify RxJS stuff of the "account-edit.component"
@Component({
    selector: `email-securely-app-account-edit`,
    templateUrl: "./account-edit.component.html",
    preserveWhitespaces: true,
})
export class AccountEditComponent implements OnInit, OnDestroy {
    // form
    typeValues: AccountType[] = ["protonmail", "tutanota"];
    entryUrlItems: EntryUrlItem[] = [];
    type = new FormControl(this.typeValues[0], Validators.required);
    entryUrl = new FormControl(null, Validators.required);
    login = new FormControl(null, Validators.required);
    password = new FormControl(null);
    twoFactorCode = new FormControl(null);
    mailPassword = new FormControl(null);
    form = new FormGroup({
        type: this.type,
        entryUrl: this.entryUrl,
        login: this.login,
        password: this.password,
        twoFactorCode: this.twoFactorCode,
        mailPassword: this.mailPassword,
    });
    // account
    existingAccount?: AccountConfig;
    updatingAccountLogin$: Subject<string> = new Subject();
    existingAccountByLogin$: Observable<[AccountConfig | undefined, string]> = this.activatedRoute.params.pipe(
        switchMap(({login}) => merge(of(login), this.updatingAccountLogin$)),
        filter((login) => !!login),
        switchMap((login) => this.store
            .select(settingsAccountByLoginSelector(login))
            .pipe(withLatestFrom(of(login))),
        ),
    );
    removingAccountLogin?: string;
    // progress
    processing$ = this.store.select(progressSelector).pipe(map(({addingAccount, updatingAccount}) => addingAccount || updatingAccount));
    removing$ = this.store.select(progressSelector).pipe(map(({removingAccount}) => removingAccount));
    // keepass
    passwordKeePassRef$ = this.existingAccountByLogin$.pipe(
        map(([account]) => account && account.credentialsKeePass.password),
    );
    twoFactorCodeKeePassRef$ = this.existingAccountByLogin$.pipe(
        map(([account]) => account && account.credentialsKeePass.twoFactorCode),
    );
    mailPasswordKeePassRef$ = this.existingAccountByLogin$.pipe(
        switchMap(([account]) => (account && account.type === "protonmail") ? of(account.credentialsKeePass.mailPassword) : EMPTY),
    );
    keePassRefCollapsed = true;
    keePassClientConf$ = this.store.select(settingsKeePassClientConfSelector);
    // other
    unSubscribe$ = new Subject();

    constructor(private optionsService: OptionsService,
                private store: Store<State>,
                private activatedRoute: ActivatedRoute) {}

    ngOnInit() {
        this.existingAccountByLogin$
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe(([accountConfig, login]) => {
                if (accountConfig) {
                    this.existingAccount = accountConfig;
                    this.form.removeControl("login");
                    this.type.patchValue(accountConfig.type);
                    this.entryUrl.patchValue(accountConfig.entryUrl);
                    this.password.patchValue(accountConfig.credentials.password);
                    this.twoFactorCode.patchValue(accountConfig.credentials.twoFactorCode);
                    if (accountConfig.type === "protonmail") {
                        this.mailPassword.patchValue(accountConfig.credentials.mailPassword);
                    }
                } else if (login === this.removingAccountLogin) {
                    this.store.dispatch(this.optionsService.buildNavigationAction({path: "accounts"}));
                }
            });

        this.type.valueChanges
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe(this.typeChangeReaction.bind(this));
        this.typeChangeReaction(this.type.value);
    }

    typeChangeReaction(type: AccountType) {
        this.entryUrlItems = ACCOUNTS_CONFIG[type].entryUrl;

        if (this.entryUrl.value && !this.entryUrlItems.some(({value}) => this.entryUrl.value === value)) {
            this.entryUrl.patchValue(null);
        }
    }

    submit() {
        const account = this.existingAccount;
        const patch: Readonly<AccountConfigPatch> = {
            login: account ? account.login : this.login.value,
            entryUrl: this.entryUrl.value,
            credentials: {
                password: this.password.value,
                twoFactorCode: this.twoFactorCode.value,
            },
            credentialsKeePass: {},
        };
        const accountType: AccountType = account ? account.type : this.type.value;

        if (accountType === "protonmail") {
            // TODO ger rid of "TS as" casting
            (patch as AccountConfigPatchByType<"protonmail">).credentials.mailPassword = this.mailPassword.value;
        }

        this.updatingAccountLogin$.next(patch.login);

        this.store.dispatch(account
            ? OPTIONS_ACTIONS.UpdateAccountRequest(patch)
            : OPTIONS_ACTIONS.AddAccountRequest({...patch, type: this.type.value} as AccountConfigCreatePatch),
        );
    }

    remove() {
        const account = this.existingAccount;

        if (!account) {
            throw new Error(`No "Account" to remove`);
        }

        if (!confirm(`Please confirm "${account.login}" account removing!`)) {
            return;
        }

        this.removingAccountLogin = account.login;

        this.store.dispatch(OPTIONS_ACTIONS.RemoveAccountRequest({login: account.login}));
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }

    onPasswordKeePassLink(keePassRef: KeePassRef) {
        this.dispatchKeePassRefUpdate("password", keePassRef);
    }

    onPasswordKeePassUnlink() {
        this.dispatchKeePassRefUpdate("password", null);
    }

    onTwoFactorCodeKeePassLink(keePassRef: KeePassRef) {
        this.dispatchKeePassRefUpdate("twoFactorCode", keePassRef);
    }

    onTwoFactorCodeKeePassUnlink() {
        this.dispatchKeePassRefUpdate("twoFactorCode", null);
    }

    onMailPasswordKeePassLink(keePassRef: KeePassRef) {
        this.dispatchKeePassRefUpdate("mailPassword", keePassRef);
    }

    onMailPasswordKeePassUnlink() {
        this.dispatchKeePassRefUpdate("mailPassword", null);
    }

    private dispatchKeePassRefUpdate(
        // TODO simplify this stuff
        // tslint:disable-next-line:max-line-length
        refType: keyof Pick<AccountConfigByType<"protonmail">, "credentialsKeePass">["credentialsKeePass"] | keyof Pick<AccountConfigByType<"tutanota">, "credentialsKeePass">["credentialsKeePass"],
        refValue: KeePassRef | null,
    ) {
        const account = this.existingAccount;

        if (!account) {
            throw new Error(`No "Account" to link/unlink KeePass record with`);
        }

        this.store.dispatch(
            OPTIONS_ACTIONS.UpdateAccountRequest({
                login: account.login,
                entryUrl: account.entryUrl,
                credentialsKeePass: {
                    [refType]: refValue,
                },
                credentials: {},
            }),
        );
    }
}
