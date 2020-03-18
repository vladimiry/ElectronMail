import {CdkDragDrop} from "@angular/cdk/drag-drop";
import {Component, HostBinding, OnDestroy} from "@angular/core";
import {Store} from "@ngrx/store";
import {Subject, Subscription} from "rxjs";
import {map, withLatestFrom} from "rxjs/operators";

import {LoginFieldContainer} from "src/shared/model/container";
import {OPTIONS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/options";

@Component({
    selector: "electron-mail-accounts",
    templateUrl: "./accounts.component.html",
    styleUrls: ["./accounts.component.scss"],
})
export class AccountsComponent implements OnDestroy {
    accounts$ = this.store.select(OptionsSelectors.SETTINGS.accounts);

    changingAccountOrder$ = this.store
        .select(OptionsSelectors.FEATURED.progress)
        .pipe(map((p) => !!p.changingAccountOrder));

    @HostBinding("class.reordering-disabled")
    reorderingDisabled = true;

    private cdkDrop$: Subject<CdkDragDrop<LoginFieldContainer>> = new Subject();

    private subscription = new Subscription();

    constructor(
        private store: Store<State>,
    ) {
        this.subscription.add(
            this.changingAccountOrder$
                .pipe(withLatestFrom(this.accounts$))
                .subscribe(([changingAccountOrder, {length}]) => {
                    return this.reorderingDisabled = changingAccountOrder || length < 2;
                }),
        );

        this.subscription.add(
            this.cdkDrop$.subscribe(({item, container, previousIndex, currentIndex}) => {
                const {nativeElement: itemEl} = item.element;
                const {nativeElement: containerEl} = container.element;
                const movedDown = currentIndex > previousIndex;

                this.store.dispatch(
                    OPTIONS_ACTIONS.ChangeAccountOrderRequest({
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

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
