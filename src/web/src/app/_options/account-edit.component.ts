import {AbstractControl, FormControl, FormGroup, Validators} from "@angular/forms";
import {ActivatedRoute} from "@angular/router";
import {Component, OnDestroy, OnInit} from "@angular/core";
import {Observable, Subject, merge} from "rxjs";
import {Store, select} from "@ngrx/store";
import {concatMap, distinctUntilChanged, map, mergeMap, takeUntil} from "rxjs/operators";

import {ACCOUNTS_CONFIG, ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX} from "src/shared/constants";
import {AccountConfig, AccountConfigProtonmail, AccountType} from "src/shared/model/account";
import {AccountConfigCreatePatch, AccountConfigUpdatePatch} from "src/shared/model/container";
import {EntryUrlItem} from "src/shared/types";
import {NAVIGATION_ACTIONS, OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/options";

@Component({
    selector: "email-securely-app-account-edit",
    templateUrl: "./account-edit.component.html",
    styleUrls: ["./account-edit.component.scss"],
    preserveWhitespaces: true,
})
export class AccountEditComponent implements OnInit, OnDestroy {
    // form
    advancedBlockCollapsed: boolean = true;
    typeValues: Array<{ value: AccountType; title: string; }> = [
        {value: "protonmail", title: "ProtonMail"},
        {value: "tutanota", title: "Tutanota"},
    ];
    entryUrlItems: EntryUrlItem[] = [];
    controls: Record<keyof Pick<AccountConfig, "type" | "login" | "database" | "entryUrl">
        | "proxyRules" | "proxyBypassRules"
        | keyof AccountConfigProtonmail["credentials"], AbstractControl> = {
        type: new FormControl(this.typeValues[0].value, Validators.required),
        login: new FormControl(null, Validators.required),
        database: new FormControl(null),
        entryUrl: new FormControl(null, Validators.required),
        proxyRules: new FormControl(null),
        proxyBypassRules: new FormControl(null),
        password: new FormControl(null),
        twoFactorCode: new FormControl(null),
        mailPassword: new FormControl(null),
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
    processing$ = this.store.pipe(
        select(OptionsSelectors.FEATURED.progress),
        map((p) => Boolean(p.addingAccount || p.updatingAccount)),
        distinctUntilChanged(),
    );
    removing$ = this.store.pipe(
        select(OptionsSelectors.FEATURED.progress),
        map((p) => Boolean(p.removingAccount)),
        distinctUntilChanged(),
    );

    // other
    unSubscribe$ = new Subject();

    constructor(private store: Store<State>,
                private activatedRoute: ActivatedRoute) {}

    ngOnInit() {
        const {controls} = this;

        this.account$
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe((account) => {
                this.account = account;

                this.form.removeControl(((name: keyof Pick<typeof AccountEditComponent.prototype.controls, "login">) => name)("login"));

                (() => {
                    controls.type.patchValue(account.type);
                    controls.database.patchValue(account.database);
                    controls.entryUrl.patchValue(account.entryUrl);

                    if (account.proxy) {
                        controls.proxyRules.patchValue(account.proxy.proxyRules);
                        controls.proxyBypassRules.patchValue(account.proxy.proxyBypassRules);
                    } else {
                        controls.proxyRules.patchValue(null);
                        controls.proxyBypassRules.patchValue(null);
                    }

                    controls.password.patchValue(account.credentials.password);
                    controls.twoFactorCode.patchValue(account.credentials.twoFactorCode);
                    if (account.type === "protonmail") {
                        controls.mailPassword.patchValue(account.credentials.mailPassword);
                    }
                })();
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
        const proxy: AccountConfig<AccountType>["proxy"] = {
            proxyRules: controls.proxyRules.value && controls.proxyRules.value.trim(),
            proxyBypassRules: controls.proxyBypassRules.value && controls.proxyBypassRules.value.trim(),
        };
        const patch: Readonly<AccountConfigUpdatePatch> = {
            login: account
                ? account.login :
                controls.login.value,
            entryUrl: controls.entryUrl.value,
            database: Boolean(controls.database.value),
            credentials: {
                password: controls.password.value,
                twoFactorCode: controls.twoFactorCode.value,
            },
            ...((proxy.proxyRules || proxy.proxyBypassRules) && {proxy}),
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

    openProxyDocsPage() {
        this.store.dispatch(NAVIGATION_ACTIONS.OpenExternal({
            url: "https://electronjs.org/docs/api/session#sessetproxyconfig-callback",
        }));
    }

    open2faEnablingIssue() {
        this.store.dispatch(NAVIGATION_ACTIONS.OpenExternal({
            url: "https://github.com/vladimiry/email-securely-app/issues/10",
        }));
    }

    openMailPasswordDescription() {
        this.store.dispatch(NAVIGATION_ACTIONS.OpenExternal({
            url: "https://protonmail.com/support/knowledge-base/what-is-the-mailbox-password/",
        }));
    }

    ngOnDestroy() {
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }
}
