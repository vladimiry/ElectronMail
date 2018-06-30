import {filter, map, mergeMap, switchMap, takeUntil, withLatestFrom} from "rxjs/operators";
import {BehaviorSubject, merge, Observable, of, Subject} from "rxjs";
import {AfterViewInit, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {ActivatedRoute} from "@angular/router";
import {Store} from "@ngrx/store";

import {AccountConfig} from "_@shared/model/account";
import {AccountConfigPatch} from "_@shared/model/container";
import {KeePassRef} from "_@shared/model/keepasshttp";
import {OPTIONS_ACTIONS} from "_@web/src/app/store/actions";
import {
    progressSelector,
    settingsAccountByLoginSelector,
    settingsKeePassClientConfSelector,
    State,
} from "_@web/src/app/store/reducers/options";
import {OptionsService} from "./options.service";

type OptionalAccount = AccountConfig | undefined;

// TODO simplify RxJS stuff of the "account-edit.component"
// for example "OptionalAccount" looks weird
@Component({
    selector: `protonmail-desktop-app-account-edit`,
    templateUrl: "./account-edit.component.html",
    preserveWhitespaces: true,
})
export class AccountEditComponent implements OnInit, AfterViewInit, OnDestroy {
    // form
    login = new FormControl(null, Validators.required);
    password = new FormControl(null);
    twoFactorCode = new FormControl(null);
    mailPassword = new FormControl(null);
    form = new FormGroup({
        login: this.login,
        password: this.password,
        twoFactorCode: this.twoFactorCode,
        mailPassword: this.mailPassword,
    });
    // account
    updatingAccountLogin$: Subject<string> = new Subject();
    possiblyExistingAccountAndPikedByLogin$: Observable<[AccountConfig | undefined, string]> = this.activatedRoute.params.pipe(
        switchMap(({login}) => merge(of(login), this.updatingAccountLogin$)),
        filter((login) => !!login),
        switchMap((login) => this.store.select(settingsAccountByLoginSelector(login)).pipe(withLatestFrom(of(login)))),
    );
    possiblyExistingAccount$: BehaviorSubject<OptionalAccount> = new BehaviorSubject(undefined as OptionalAccount);
    existingAccount$: Observable<AccountConfig> = this.possiblyExistingAccount$.pipe(
        mergeMap((account) => account ? [account] : []),
    );
    removingAccountLogin?: string;
    // progress
    processing$ = this.store.select(progressSelector).pipe(map(({addingAccount, updatingAccount}) => addingAccount || updatingAccount));
    removing$ = this.store.select(progressSelector).pipe(map(({removingAccount}) => removingAccount));
    // keepass
    passwordKeePassRef$ = this.existingAccount$.pipe(
        map(({credentials}) => credentials.password.keePassRef),
    );
    twoFactorCodeKeePassRef$ = this.existingAccount$.pipe(
        map(({credentials}) => credentials.twoFactorCode ? credentials.twoFactorCode.keePassRef : undefined),
    );
    mailPasswordKeePassRef$ = this.existingAccount$.pipe(
        map(({credentials}) => credentials.mailPassword.keePassRef),
    );
    keePassRefCollapsed = true;
    keePassClientConf$ = this.store.select(settingsKeePassClientConfSelector);
    // other
    @ViewChildren("loginRef")
    loginElementRefQuery: QueryList<ElementRef>;
    unSubscribe$ = new Subject();

    constructor(private optionsService: OptionsService,
                private store: Store<State>,
                private activatedRoute: ActivatedRoute) {}

    ngOnInit() {
        this.possiblyExistingAccountAndPikedByLogin$
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe(([accountConfig, login]) => {
                if (accountConfig) {
                    this.possiblyExistingAccount$.next(accountConfig);
                    this.form.removeControl("login");
                    this.password.patchValue(accountConfig.credentials.password.value);
                    this.mailPassword.patchValue(accountConfig.credentials.mailPassword.value);
                    if (accountConfig.credentials.twoFactorCode) {
                        this.twoFactorCode.patchValue(accountConfig.credentials.twoFactorCode.value);
                    }
                } else if (login === this.removingAccountLogin) {
                    this.store.dispatch(this.optionsService.buildNavigationAction({path: "accounts"}));
                }
            });
    }

    ngAfterViewInit() {
        if (this.loginElementRefQuery.length) {
            this.loginElementRefQuery.first.nativeElement.focus();
        }
    }

    submit() {
        const account = this.possiblyExistingAccount$.getValue();
        const patch: AccountConfigPatch = {
            login: account ? account.login : this.login.value,
            passwordValue: this.password.value,
            twoFactorCodeValue: this.twoFactorCode.value,
            mailPasswordValue: this.mailPassword.value,
        };

        this.updatingAccountLogin$.next(patch.login);

        this.store.dispatch(account
            ? OPTIONS_ACTIONS.UpdateAccountRequest(patch)
            : OPTIONS_ACTIONS.AddAccountRequest(patch),
        );
    }

    remove() {
        const account = this.possiblyExistingAccount$.getValue();

        if (!account) {
            throw new Error("No \"Account\" to remove");
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
        this.dispatchKeePassRefUpdate("passwordKeePassRef", keePassRef);
    }

    onPasswordKeePassUnlink() {
        this.dispatchKeePassRefUpdate("passwordKeePassRef", null);
    }

    onTwoFactorCodeKeePassLink(keePassRef: KeePassRef) {
        this.dispatchKeePassRefUpdate("twoFactorCodeKeePassRef", keePassRef);
    }

    onTwoFactorCodeKeePassUnlink() {
        this.dispatchKeePassRefUpdate("twoFactorCodeKeePassRef", null);
    }

    onMailPasswordKeePassLink(keePassRef: KeePassRef) {
        this.dispatchKeePassRefUpdate("mailPasswordKeePassRef", keePassRef);
    }

    onMailPasswordKeePassUnlink() {
        this.dispatchKeePassRefUpdate("mailPasswordKeePassRef", null);
    }

    private dispatchKeePassRefUpdate(
        refType: keyof Required<Pick<AccountConfigPatch, "passwordKeePassRef" | "twoFactorCodeKeePassRef" | "mailPasswordKeePassRef">>,
        refValue: KeePassRef | null,
    ) {
        const account = this.possiblyExistingAccount$.getValue();

        if (!account) {
            throw new Error("No \"Account\" to link/unlink KeePass record with");
        }

        this.store.dispatch(
            OPTIONS_ACTIONS.UpdateAccountRequest({
                login: account.login,
                [refType]: refValue,
            }),
        );
    }
}
