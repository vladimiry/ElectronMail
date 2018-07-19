import {AbstractControl, FormControl, FormGroup, Validators} from "@angular/forms";
import {ActivatedRoute} from "@angular/router";
import {Component, OnDestroy, OnInit} from "@angular/core";
import {EMPTY, merge, Observable, of, Subject} from "rxjs";
import {filter, map, switchMap, takeUntil, withLatestFrom} from "rxjs/operators";
import {Store} from "@ngrx/store";

import {
    progressSelector,
    settingsAccountByLoginSelector,
    settingsKeePassClientConfSelector,
    State,
} from "src/web/src/app/store/reducers/options";
import {AccountConfig, AccountType} from "src/shared/model/account";
import {AccountConfigCreatePatch, AccountConfigUpdatePatch} from "src/shared/model/container";
import {ACCOUNTS_CONFIG, EntryUrlItem} from "src/shared/constants";
import {KeePassRef} from "src/shared/model/keepasshttp";
import {OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {OptionsService} from "./options.service";

@Component({
    selector: "email-securely-app-account-edit",
    templateUrl: "./account-edit.component.html",
    styleUrls: ["./account-edit.component.scss"],
    preserveWhitespaces: true,
})
export class AccountEditComponent implements OnInit, OnDestroy {
    // form
    typeValues: AccountType[] = ["protonmail", "tutanota"];
    entryUrlItems: EntryUrlItem[] = [];
    controls: Record<keyof Pick<AccountConfig, "type" | "login" | "storeMails" | "entryUrl">
        | keyof AccountConfig<"protonmail">["credentials"], AbstractControl> = {
        type: new FormControl(this.typeValues[0], Validators.required),
        login: new FormControl(null, Validators.required),
        storeMails: new FormControl(null),
        entryUrl: new FormControl(null, Validators.required),
        password: new FormControl(null),
        twoFactorCode: new FormControl(null),
        mailPassword: new FormControl(null),
    };
    form = new FormGroup(this.controls);
    // account
    existingAccount?: AccountConfig;
    submittedAccountLogin$: Subject<string> = new Subject();
    existingAccountByLogin$: Observable<[AccountConfig | undefined, string]> = this.activatedRoute.params.pipe(
        switchMap(({login}) => merge(of(login), this.submittedAccountLogin$)),
        filter((login) => Boolean(login)),
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
        const {controls} = this;

        this.existingAccountByLogin$
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe(([accountConfig, login]) => {
                if (accountConfig) {
                    // patch form values only once, initially
                    if (!this.existingAccount) {
                        this.form.removeControl(
                            ((name: keyof Pick<typeof AccountEditComponent.prototype.controls, "login">) => name)("login"),
                        );

                        controls.type.patchValue(accountConfig.type);
                        controls.entryUrl.patchValue(accountConfig.entryUrl);
                        controls.storeMails.patchValue(accountConfig.storeMails);
                        controls.password.patchValue(accountConfig.credentials.password);
                        controls.twoFactorCode.patchValue(accountConfig.credentials.twoFactorCode);
                        if (accountConfig.type === "protonmail") {
                            controls.mailPassword.patchValue(accountConfig.credentials.mailPassword);
                        }
                    }

                    // assign after form values after the patching
                    this.existingAccount = accountConfig;
                } else if (login === this.removingAccountLogin) {
                    this.store.dispatch(this.optionsService.buildNavigationAction({path: "accounts"}));
                }
            });

        controls.type.valueChanges
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe(this.typeChangeReaction.bind(this));
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
        const account = this.existingAccount;
        const patch: Readonly<AccountConfigUpdatePatch> = {
            login: account ? account.login : controls.login.value,
            entryUrl: controls.entryUrl.value,
            storeMails: Boolean(controls.storeMails.value),
            credentials: {
                password: controls.password.value,
                twoFactorCode: controls.twoFactorCode.value,
            },
            credentialsKeePass: {},
        };
        const accountType: AccountType = account ? account.type : controls.type.value;

        if (accountType === "protonmail") {
            // TODO ger rid of "TS as" casting
            (patch as AccountConfig<"protonmail">).credentials.mailPassword = controls.mailPassword.value;
        }

        this.submittedAccountLogin$.next(patch.login);

        this.store.dispatch(account
            ? OPTIONS_ACTIONS.UpdateAccountRequest(patch)
            : OPTIONS_ACTIONS.AddAccountRequest({...patch, type: controls.type.value} as AccountConfigCreatePatch),
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

    dispatchKeePassRefUpdate(
        // TODO simplify type definition of "refType"
        refType: keyof Pick<AccountConfig<"protonmail">, "credentialsKeePass">["credentialsKeePass"]
            | keyof Pick<AccountConfig<"tutanota">, "credentialsKeePass">["credentialsKeePass"],
        refValue: KeePassRef | null,
    ) {
        const account = this.existingAccount;

        if (!account) {
            throw new Error(`No "Account" to link/unlink KeePass record with`);
        }

        this.store.dispatch(OPTIONS_ACTIONS.UpdateAccountRequest({
            login: account.login,
            credentialsKeePass: {
                [refType]: refValue,
            },
        }));
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }
}
