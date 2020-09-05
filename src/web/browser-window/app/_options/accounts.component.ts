import {CdkDragDrop} from "@angular/cdk/drag-drop";
import {Component, HostBinding, OnDestroy} from "@angular/core";
import {Observable} from "rxjs/internal/Observable";
import {Store} from "@ngrx/store";
import {Subject, Subscription} from "rxjs";
import {map, withLatestFrom} from "rxjs/operators";

import {AccountConfig} from "src/shared/model/account";
import {LoginFieldContainer} from "src/shared/model/container";
import {NAVIGATION_ACTIONS, OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/browser-window/app/app.constants";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Component({
    selector: "electron-mail-accounts",
    templateUrl: "./accounts.component.html",
    styleUrls: ["./accounts.component.scss"],
})
export class AccountsComponent implements OnDestroy {
    readonly accounts$ = this.store.select(OptionsSelectors.SETTINGS.accounts);

    readonly changingAccountOrder$: Observable<boolean> = this.store
        .select(OptionsSelectors.FEATURED.progress)
        .pipe(map((progress) => Boolean(progress.changingAccountOrder)));

    readonly togglingAccountDisabling$: Observable<boolean> = this.store
        .select(OptionsSelectors.FEATURED.progress)
        .pipe(map((progress) => Boolean(progress.togglingAccountDisabling)));

    @HostBinding("class.reordering-disabled")
    reorderingDisabled = true;

    private cdkDrop$: Subject<CdkDragDrop<LoginFieldContainer>> = new Subject();

    private subscription = new Subscription();

    constructor(
        private readonly store: Store<State>,
    ) {
        this.subscription.add(
            this.changingAccountOrder$
                .pipe(withLatestFrom(this.accounts$))
                .subscribe(([changingAccountOrder, {length}]) => {
                    this.reorderingDisabled = changingAccountOrder || length < 2;
                }),
        );

        this.subscription.add(
            this.cdkDrop$.subscribe(({item, container, previousIndex, currentIndex}) => {
                const {nativeElement: itemEl} = item.element;
                const {nativeElement: containerEl} = container.element;
                const movedDown = currentIndex > previousIndex;

                this.store.dispatch(
                    OPTIONS_ACTIONS.ChangeAccountOrderRequest({
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                        login: item.data.login,
                        index: currentIndex,
                    }),
                );

                containerEl.insertBefore(
                    itemEl,
                    containerEl
                        .querySelectorAll(".cdk-drag")
                        .item(currentIndex + Number(movedDown)),
                );
            }),
        );
    }

    cdkDrop(event: CdkDragDrop<LoginFieldContainer>): void {
        this.cdkDrop$.next(event);
    }

    toggleAccountDisabling(login: AccountConfig["login"]): void {
        this.store.dispatch(
            OPTIONS_ACTIONS.ToggleAccountDisablingRequest({login}),
        );
    }

    navigateToAccountEdit(login?: AccountConfig["login"]): void {
        this.store.dispatch(
            NAVIGATION_ACTIONS.Go({
                path: [{outlets: {[SETTINGS_OUTLET]: `${SETTINGS_PATH}/account-edit`}}],
                ...(login && {queryParams: {login}}),
            }),
        );
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
