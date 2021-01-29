import {AbstractControl, FormControl, FormGroup, Validators} from "@angular/forms";
import {ActivatedRoute} from "@angular/router";
import {Component, ElementRef, Inject, OnDestroy, OnInit} from "@angular/core";
import {Observable, Subscription, merge} from "rxjs";
import {Store, select} from "@ngrx/store";
import {concatMap, distinctUntilChanged, map, mergeMap} from "rxjs/operators";

import {ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN, PROTON_API_ENTRY_RECORDS} from "src/shared/constants";
import {AccountConfig} from "src/shared/model/account";
import {AccountConfigCreateUpdatePatch} from "src/shared/model/container";
import {OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {PACKAGE_GITHUB_PROJECT_URL_TOKEN} from "src/web/browser-window/app/app.constants";
import {State} from "src/web/browser-window/app/store/reducers/options";
import {getWebLogger} from "src/web/browser-window/util";
import {validateExternalContentProxyUrlPattern, validateLoginDelaySecondsRange} from "src/shared/util";

@Component({
    selector: "electron-mail-account-edit",
    templateUrl: "./account-edit.component.html",
    styleUrls: ["./account-edit.component.scss"],
    preserveWhitespaces: true,
})
export class AccountEditComponent implements OnInit, OnDestroy {
    entryUrlItems = [...PROTON_API_ENTRY_RECORDS];
    controls: Record<keyof Pick<AccountConfig,
        | "customCSS"
        | "login"
        | "title"
        | "database"
        | "persistentSession"
        | "rotateUserAgent"
        | "entryUrl"
        | "blockNonEntryUrlBasedRequests"
        | "externalContentProxyUrlPattern"
        | "enableExternalContentProxy"
        | "loginDelayUntilSelected"
        | "loginDelaySecondsRange">
        | keyof Pick<Required<Required<AccountConfig>["proxy"]>, "proxyRules" | "proxyBypassRules">
        | keyof AccountConfig["credentials"],
        AbstractControl> = {
        customCSS: new FormControl(null),
        blockNonEntryUrlBasedRequests: new FormControl(null),
        externalContentProxyUrlPattern: new FormControl(
            null,
            (): null | { errorMsg: string } => {
                if (!this.controls) {
                    return null;
                }
                const {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    externalContentProxyUrlPattern: {value: externalContentProxyUrlPattern},
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    enableExternalContentProxy: {value: enableExternalContentProxy},
                } = this.controls;
                const validated = validateExternalContentProxyUrlPattern(
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    {externalContentProxyUrlPattern, enableExternalContentProxy},
                );
                if (!validated) {
                    const msg = `Value should be a valid URL with inserted "${ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN}" pattern`;
                    return {errorMsg: msg};
                }
                return null;
            },
        ),
        enableExternalContentProxy: new FormControl(null),
        login: new FormControl(
            null,
            Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
        ),
        title: new FormControl(null),
        database: new FormControl(null),
        persistentSession: new FormControl(null),
        rotateUserAgent: new FormControl(null),
        entryUrl: new FormControl(
            null,
            Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
        ),
        proxyRules: new FormControl(null),
        proxyBypassRules: new FormControl(null),
        password: new FormControl(null),
        twoFactorCode: new FormControl(null),
        mailPassword: new FormControl(null),
        loginDelayUntilSelected: new FormControl(null),
        loginDelaySecondsRange: new FormControl(
            null,
            (): null | { errorMsg: string } => {
                if (!this.controls) {
                    return null;
                }
                const {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    loginDelaySecondsRange: {value},
                } = this.controls;
                const validated = Boolean(value) && validateLoginDelaySecondsRange(value);
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
    private readonly logger = getWebLogger();
    private readonly subscription = new Subscription();

    constructor(
        @Inject(PACKAGE_GITHUB_PROJECT_URL_TOKEN)
        public readonly PACKAGE_GITHUB_PROJECT_URL: string,
        private readonly store: Store<State>,
        private readonly activatedRoute: ActivatedRoute,
        private readonly elementRef: ElementRef,
    ) {}

    ngOnInit(): void {
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

                controls.customCSS.patchValue(account.customCSS);
                controls.title.patchValue(account.title);
                controls.database.patchValue(account.database);
                controls.persistentSession.patchValue(account.persistentSession);
                controls.rotateUserAgent.patchValue(account.rotateUserAgent);
                controls.entryUrl.patchValue(account.entryUrl);
                controls.blockNonEntryUrlBasedRequests.patchValue(account.blockNonEntryUrlBasedRequests);
                controls.externalContentProxyUrlPattern.patchValue(account.externalContentProxyUrlPattern);
                controls.enableExternalContentProxy.patchValue(account.enableExternalContentProxy);
                controls.proxyRules.patchValue(account.proxy?.proxyRules);
                controls.proxyBypassRules.patchValue(account.proxy?.proxyBypassRules);

                controls.password.patchValue(account.credentials.password);
                controls.twoFactorCode.patchValue(account.credentials.twoFactorCode);
                controls.mailPassword.patchValue(account.credentials.mailPassword);

                controls.loginDelayUntilSelected.patchValue(account.loginDelayUntilSelected);
                controls.loginDelaySecondsRange.patchValue(
                    account.loginDelaySecondsRange
                        ? `${account.loginDelaySecondsRange.start}-${account.loginDelaySecondsRange.end}`
                        : undefined,
                );
            }),
        );

        this.subscription.add(
            controls.enableExternalContentProxy.valueChanges.subscribe(() => {
                this.touchExternalContentProxyUrlPatternControl();
            }),
        );
    }

    touchExternalContentProxyUrlPatternControl(): void {
        this.controls.externalContentProxyUrlPattern.markAsTouched();
        this.controls.externalContentProxyUrlPattern.markAsDirty();
        this.controls.externalContentProxyUrlPattern.updateValueAndValidity();
    }

    fillDefaultExternalContentProxyUrlPattern(): void {
        this.controls.externalContentProxyUrlPattern.patchValue(
            `https://external-content.duckduckgo.com/iu/?u=${ACCOUNT_EXTERNAL_CONTENT_PROXY_URL_REPLACE_PATTERN}`,
        );
    }

    submit(): void {
        const {controls, account} = this;
        const proxy: AccountConfig["proxy"] = {
            proxyRules: ( // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                controls.proxyRules.value
                &&
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                controls.proxyRules.value.trim()
            ),
            proxyBypassRules: ( // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                controls.proxyBypassRules.value
                &&
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                controls.proxyBypassRules.value.trim() // eslint-disable-line @typescript-eslint/no-unsafe-call
            ),
        };
        const patch: Readonly<AccountConfigCreateUpdatePatch> = { // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            login: account // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                ? account.login :
                controls.login.value,
            title: controls.title.value, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            customCSS: controls.customCSS.value, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            entryUrl: controls.entryUrl.value, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            blockNonEntryUrlBasedRequests: Boolean(controls.blockNonEntryUrlBasedRequests.value),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            externalContentProxyUrlPattern: controls.externalContentProxyUrlPattern.value,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            enableExternalContentProxy: Boolean(controls.enableExternalContentProxy.value),
            database: Boolean(controls.database.value),
            persistentSession: Boolean(controls.persistentSession.value),
            rotateUserAgent: Boolean(controls.rotateUserAgent.value),
            credentials: {
                password: controls.password.value, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                twoFactorCode: controls.twoFactorCode.value, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                mailPassword: controls.mailPassword.value, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
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

    remove(): void {
        const {account} = this;

        if (!account) {
            throw new Error(`No "Account" to remove`);
        }

        if (!confirm(`Please confirm "${account.login}" account removing!`)) {
            return;
        }

        this.store.dispatch(OPTIONS_ACTIONS.RemoveAccountRequest(account));
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
