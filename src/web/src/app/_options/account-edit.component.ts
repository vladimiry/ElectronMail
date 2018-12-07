import {AbstractControl, FormControl, FormGroup, Validators} from "@angular/forms";
import {ActivatedRoute} from "@angular/router";
import {Component, OnDestroy, OnInit} from "@angular/core";
import {Observable, Subject, merge} from "rxjs";
import {Store} from "@ngrx/store";
import {concatMap, filter, map, mergeMap, pairwise, takeUntil} from "rxjs/operators";

import {ACCOUNTS_CONFIG, ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX} from "src/shared/constants";
import {AccountConfig, AccountConfigProtonmail, AccountType} from "src/shared/model/account";
import {AccountConfigCreatePatch, AccountConfigUpdatePatch} from "src/shared/model/container";
import {EntryUrlItem} from "src/shared/types";
import {OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {OptionsService} from "./options.service";
import {State} from "src/web/src/app/store/reducers/options";

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
    controls: Record<keyof Pick<AccountConfig, "type" | "login" | "database" | "entryUrl">
        | keyof AccountConfigProtonmail["credentials"], AbstractControl> = {
        type: new FormControl(this.typeValues[0], Validators.required),
        login: new FormControl(null, Validators.required),
        database: new FormControl(null),
        entryUrl: new FormControl(null, Validators.required),
        password: new FormControl(null),
        twoFactorCode: new FormControl(null),
        mailPassword: new FormControl(null),
    };
    form = new FormGroup(this.controls);
    // TODO release: remove temporary "typeControlDisplayable" property
    typeControlDisplayable: boolean = false;
    // account
    account?: AccountConfig;
    account$: Observable<AccountConfig> = merge(this.activatedRoute.params, this.activatedRoute.queryParams).pipe(
        mergeMap(({login}) => login ? [String(login)] : []),
        concatMap((login) => this.store.select(OptionsSelectors.SETTINGS.pickAccount({login}))),
        mergeMap((account) => account ? [account] : []),
    );
    // progress
    processing$ = this.store.select(OptionsSelectors.FEATURED.progress).pipe(map((p) => p.addingAccount || p.updatingAccount));
    removing$ = this.store.select(OptionsSelectors.FEATURED.progress).pipe(map((p) => p.removingAccount));
    // other
    unSubscribe$ = new Subject();

    constructor(private optionsService: OptionsService,
                private store: Store<State>,
                private activatedRoute: ActivatedRoute) {
        if ((process.env.NODE_ENV/* as BuildEnvironment*/) === "development") {
            this.typeControlDisplayable = true;
        }
    }

    ngOnInit() {
        const {controls} = this;

        this.account$
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe((account) => {
                this.account = account;

                this.form.removeControl(((name: keyof Pick<typeof AccountEditComponent.prototype.controls, "login">) => name)("login"));

                controls.type.patchValue(account.type);
                controls.entryUrl.patchValue(account.entryUrl);
                controls.database.patchValue(account.database);
                controls.password.patchValue(account.credentials.password);
                controls.twoFactorCode.patchValue(account.credentials.twoFactorCode);
                if (account.type === "protonmail") {
                    controls.mailPassword.patchValue(account.credentials.mailPassword);
                }
            });

        this.store.select(OptionsSelectors.SETTINGS.accounts).pipe(
            pairwise(),
            filter(([prevAccounts, currAccounts]) => currAccounts.length !== prevAccounts.length),
            takeUntil(this.unSubscribe$),
        ).subscribe(([{length: prevAccountsCount}, accounts]) => {
            const removed = accounts.length < prevAccountsCount;
            const added = accounts.length > prevAccountsCount;
            const goTo = removed ? {path: "accounts"}
                : added ? {path: "account-edit", queryParams: {login: accounts[accounts.length - 1].login}}
                    : false; // "false" is not really possibel due to the above "currAccounts.length !== prevAccounts.length" filtering
            if (goTo) {
                this.store.dispatch(this.optionsService.settingsNavigationAction(goTo));
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
        const account = this.account;
        const patch: Readonly<AccountConfigUpdatePatch> = {
            login: account ? account.login : controls.login.value,
            entryUrl: controls.entryUrl.value,
            database: Boolean(controls.database.value),
            credentials: {
                password: controls.password.value,
                twoFactorCode: controls.twoFactorCode.value,
            },
        };
        const accountType: AccountType = account ? account.type : controls.type.value;

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
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }
}
