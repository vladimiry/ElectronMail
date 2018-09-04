import {Component, HostBinding, OnDestroy} from "@angular/core";
import {DragulaService} from "ng2-dragula";
import {Store} from "@ngrx/store";
import {Subscription} from "rxjs";
import {map, withLatestFrom} from "rxjs/operators";

import {OPTIONS_ACTIONS} from "src/web/src/app/store/actions";
import {OptionsSelectors} from "src/web/src/app/store/selectors";
import {State} from "src/web/src/app/store/reducers/options";

@Component({
    selector: "email-securely-app-accounts",
    templateUrl: "./accounts.component.html",
    styleUrls: ["./accounts.component.scss"],
})
export class AccountsComponent implements OnDestroy {
    accounts$ = this.store.select(OptionsSelectors.SETTINGS.accounts);
    changingAccountOrder$ = this.store.select(OptionsSelectors.FEATURED.progress).pipe(map((p) => !!p.changingAccountOrder));
    reorderingGroup = "accounts";
    @HostBinding("class.reordering-disabled")
    reorderingDisabled: boolean = true;
    private subscription = new Subscription();

    constructor(
        private store: Store<State>,
        private dragulaService: DragulaService,
    ) {
        this.subscription.add(
            this.changingAccountOrder$
                .pipe(withLatestFrom(this.accounts$))
                .subscribe(([value, accounts]) => this.reorderingDisabled = value || accounts.length < 2),
        );

        this.dragulaService.createGroup(this.reorderingGroup, {
            moves: (el, container, handle) => !this.reorderingDisabled && Boolean(handle && handle.classList.contains("fa-bars")),
            accepts: (el, target) => Boolean(target && target.classList.contains("list-group")),
        });

        this.subscription.add(
            this.dragulaService.drop(this.reorderingGroup)
                .pipe(
                    map((({el, target}) => ({
                        login: el.getAttribute("data-login"),
                        index: Array.from(target.childNodes)
                            .filter(({nodeType, nodeName}) => nodeType === Node.ELEMENT_NODE && nodeName.toLowerCase() === "li")
                            .findIndex((item) => item === el),
                    }))),
                )
                .subscribe(({login, index}) => {
                    this.store.dispatch(OPTIONS_ACTIONS.ChangeAccountOrderRequest({login: login as string, index}));
                }),
        );
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
        this.dragulaService.destroy(this.reorderingGroup);
    }
}
