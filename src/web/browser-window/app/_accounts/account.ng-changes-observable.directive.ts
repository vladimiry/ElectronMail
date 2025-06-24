import {Directive, Injector, Input, inject} from "@angular/core";
import {distinctUntilChanged, map, mergeMap, switchMap, take} from "rxjs/operators";
import {EMPTY, lastValueFrom} from "rxjs";
import type {Observable} from "rxjs";
import {select, Store} from "@ngrx/store";

import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {NgChangesObservableDirective} from "src/web/browser-window/app/components/ng-changes-observable.directive";
import type {WebAccount} from "src/web/browser-window/app/model";

@Directive()
// so weird not single-purpose directive huh, https://github.com/angular/angular/issues/30080#issuecomment-539194668
// eslint-disable-next-line @angular-eslint/directive-class-suffix
export abstract class AccountLoginAwareDirective extends NgChangesObservableDirective {
    protected readonly injector = inject(Injector);

    @Input({required: true})
    readonly login: string = "";

    protected readonly account$: Observable<WebAccount> = this.ngChangesObservable("login").pipe(
        switchMap((login) =>
            this.injector.get(Store).pipe(
                select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
                mergeMap((account) => account ? [account] : EMPTY),
            )
        ),
    );

    protected readonly persistentSession$ = this.account$.pipe(
        map(({accountConfig: {persistentSession}}) => Boolean(persistentSession)),
        distinctUntilChanged(),
    );

    protected readonly ipcMainClient;

    constructor() {
        super();
        this.ipcMainClient = this.injector.get(ElectronService).ipcMainClient();
    }

    protected async resolveAccountIndex(): Promise<Pick<WebAccount, "accountIndex">> {
        return {accountIndex: (await lastValueFrom(this.account$.pipe(take(1)))).accountIndex};
    }
}
