import {BehaviorSubject, Subscription} from "rxjs";
import {Component, ElementRef, HostListener, Input} from "@angular/core";
import {filter, first, map} from "rxjs/operators";
import type {OnDestroy, OnInit} from "@angular/core";
import {select, Store} from "@ngrx/store";
import type {Unsubscribable} from "rxjs";

import {ACCOUNTS_ACTIONS, NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/browser-window/app/app.constants";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {WebAccount} from "src/web/browser-window/app/model";

interface ComponentState {
    account: WebAccount
    selected: boolean
    stored: boolean
    title: string
    contextMenuOpen: boolean
}

const initialComponentState: DeepReadonly<StrictOmit<ComponentState, "account">> = {
    // account: null,
    selected: false,
    stored: false,
    title: "",
    contextMenuOpen: false,
};

@Component({
    selector: "electron-mail-account-title",
    templateUrl: "./account-title.component.html",
    styleUrls: ["./account-title.component.scss"],
})
export class AccountTitleComponent implements OnInit, OnDestroy {
    @Input()
    highlighting = true;

    private readonly stateSubject$ = new BehaviorSubject<ComponentState>({...initialComponentState} as ComponentState);

    // TODO consider replacing observable with just an object explicitly triggering ChangeDetectorRef.detectChanges() after its mutation
    // tslint:disable-next-line:member-ordering
    readonly state$ = this.stateSubject$
        .asObservable()
        .pipe(
            filter((state) => Boolean(state.account)),
            map((state) => {
                return {
                    ...state,
                    loginDelayed: Boolean(state.account.loginDelayedSeconds || state.account.loginDelayedUntilSelected),
                };
            }),
        );

    private readonly subscription = new Subscription();

    @Input()
    set account(account: WebAccount) {
        this.patchState({
            account,
            stored: account.accountConfig.database,
            // TODO live attachments export: print export progress in a separate app notifications section, not inside the account button
            title: (
                (account.accountConfig.title || account.accountConfig.login)
                +
                account.dbExportProgress
                    .map((item, idx, {length}) => ` (export${length > 1 ? ` ${idx + 1}` : ""}: ${item.progress}%)`)
                    .join("")
            ),
        });
    }

    constructor(
        private readonly store: Store<State>,
        private readonly elementRef: ElementRef,
    ) {}

    ngOnInit(): void {
        if (this.highlighting) {
            this.subscription.add(
                this.store
                    .pipe(select(AccountsSelectors.FEATURED.selectedLogin))
                    .subscribe((selectedLogin) => {
                        return this.patchState({selected: this.stateSubject$.value.account.accountConfig.login === selectedLogin});
                    }),
            );
        }
        this.subscription.add(
            ((): Unsubscribable => {
                const target = document.body;
                const args = ["click", ({target: eventTarget}: MouseEvent) => {
                    const traversing: { el: Node | null, depthLimit: number } = {el: eventTarget as Node, depthLimit: 10};
                    const {nativeElement} = this.elementRef; // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                    while (traversing.el && traversing.depthLimit) {
                        if (traversing.el === nativeElement) return;
                        traversing.el = traversing.el.parentNode;
                        traversing.depthLimit--;
                    }
                    this.patchState({contextMenuOpen: false});
                }] as const;
                target.addEventListener(...args);
                return {unsubscribe: () => target.removeEventListener(...args)};
            })(),
        );
        this.subscription.add(
            this.state$
                .pipe(first())
                .subscribe(({account: {accountConfig: {database, localStoreViewByDefault}}}) => {
                    if (database && localStoreViewByDefault) {
                        this.store.dispatch(ACCOUNTS_ACTIONS.ToggleDatabaseView(
                            {login: this.stateSubject$.value.account.accountConfig.login, forced: {databaseView: true}},
                        ));
                    }
                }),
        );
    }

    @HostListener("contextmenu", ["$event"])
    onContextMenu(event: MouseEvent): void {
        event.preventDefault();
        this.patchState({contextMenuOpen: true});
    }

    unloadContextMenuAction(event: MouseEvent): void {
        event.preventDefault();
        this.patchState({contextMenuOpen: false});
        this.store.dispatch(ACCOUNTS_ACTIONS.Unload({login: this.stateSubject$.value.account.accountConfig.login}));
    }

    editContextMenuAction(event: MouseEvent): void {
        event.preventDefault();
        this.patchState({contextMenuOpen: false});
        this.store.dispatch(
            NAVIGATION_ACTIONS.Go({
                path: [{outlets: {[SETTINGS_OUTLET]: `${SETTINGS_PATH}/account-edit`}}],
                queryParams: {login: this.stateSubject$.value.account.accountConfig.login},
            }),
        );
    }

    toggleViewMode(event: Event): void {
        event.stopPropagation();
        this.store.dispatch(ACCOUNTS_ACTIONS.ToggleDatabaseView({login: this.stateSubject$.value.account.accountConfig.login}));
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    private patchState(patch: Partial<ComponentState>): void {
        this.stateSubject$.next({...this.stateSubject$.value, ...patch});
    }
}
