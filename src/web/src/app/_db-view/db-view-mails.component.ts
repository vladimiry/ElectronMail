import {ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, OnInit} from "@angular/core";
import {Store} from "@ngrx/store";
import {Subscription, fromEvent} from "rxjs";
import {distinctUntilChanged, map, mergeMap} from "rxjs/operators";

import {DB_VIEW_ACTIONS} from "src/web/src/app/store/actions";
import {DbViewAbstractComponent} from "src/web/src/app/_db-view/db-view-abstract.component";
import {Mail} from "src/shared/model/database";
import {MailsBundleKey, State} from "src/web/src/app/store/reducers/db-view";
import {Unpacked} from "src/shared/types";

// TODO read "electron-mail-db-view-mail" from the DbViewMailComponent.selector property
const mailComponentTagName = "electron-mail-db-view-mail";

@Component({
    selector: "electron-mail-db-view-mails",
    templateUrl: "./db-view-mails.component.html",
    styleUrls: ["./db-view-mails.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsComponent extends DbViewAbstractComponent implements OnInit, OnDestroy {
    // TODO enable iteration limit
    private static resolveMailComponentElement(element: Element | null): Element | null {
        while (element) {
            if (element.tagName.toLowerCase() === mailComponentTagName) {
                return element;
            }
            element = element.parentElement;
        }
        return null;
    }

    @Input()
    mailsBundleKey!: MailsBundleKey;

    mailsBundleKey$ = this.ngChangesObservable("mailsBundleKey").pipe(
        distinctUntilChanged(),
    );

    mailsBundle$ = this.mailsBundleKey$.pipe(
        mergeMap((mailsBundleKey) => this.instance$.pipe(
            map((instance) => instance[mailsBundleKey]),
            distinctUntilChanged(),
        )),
    );

    title$ = this.mailsBundle$.pipe(
        mergeMap((mailsBundle) => [mailsBundle.title]),
        distinctUntilChanged(),
    );

    items$ = this.mailsBundle$.pipe(
        mergeMap((mailsBundle) => [mailsBundle.items]),
        distinctUntilChanged(),
    );

    paging$ = this.mailsBundle$.pipe(
        mergeMap((mailsBundle) => [mailsBundle.paging]),
        distinctUntilChanged(),
    );

    sorting$ = this.mailsBundle$.pipe(
        mergeMap((mailsBundle) => [{sorters: mailsBundle.sorters, sorterIndex: mailsBundle.sorterIndex}]),
        distinctUntilChanged(),
    );

    private subscription = new Subscription();

    private _uid?: string;

    @Input()
    set uid(value: string) {
        if (this._uid && this._uid !== value) {
            this.store.dispatch(DB_VIEW_ACTIONS.Paging({
                dbAccountPk: this.dbAccountPk,
                mailsBundleKey: this.mailsBundleKey,
                reset: true,
            }));
        }
        this._uid = value;
    }

    constructor(
        private elementRef: ElementRef,
        store: Store<State>,
    ) {
        super(store);
    }

    ngOnInit(): void {
        // TODO use "@HostListener("click", ["$event"])" as soon as  https://github.com/angular/angular/issues/19878 gets resolved
        this.subscription.add(
            fromEvent(this.elementRef.nativeElement, "click").subscribe((event) => {
                const target = (event as MouseEvent).target as Element;
                const mailElement = DbViewMailsComponent.resolveMailComponentElement(target);

                if (!mailElement) {
                    return;
                }

                const mailPk: Mail["pk"] | undefined = mailElement.getAttribute("data-pk") as any;

                if (mailPk) {
                    this.store.dispatch(DB_VIEW_ACTIONS.SelectMailRequest({dbAccountPk: this.dbAccountPk, mailPk}));
                }
            }),
        );

        this.subscription.add(
            this.instance$
                .pipe(
                    map((value) => value.selectedMail && value.selectedMail.listMailPk),
                    distinctUntilChanged(),
                )
                .subscribe((selectedMailPk) => {
                    const selectedClassName = "selected";
                    const el = this.elementRef.nativeElement as Element;
                    const toDeselect = el.querySelector(`${mailComponentTagName}.${selectedClassName}`);
                    const toSelect = el.querySelector(`${mailComponentTagName}[data-pk='${selectedMailPk}']`);

                    if (toDeselect) {
                        toDeselect.classList.remove(selectedClassName);
                    }
                    if (toSelect) {
                        toSelect.classList.add(selectedClassName);
                    }
                }),
        );

        this.subscription.add(
            this.mailsBundleKey$.subscribe(() => {
                this.store.dispatch(DB_VIEW_ACTIONS.Paging({
                    dbAccountPk: this.dbAccountPk,
                    mailsBundleKey: this.mailsBundleKey,
                    reset: true,
                }));
            }),
        );
    }

    sortChange(sorterIndex: number | string) {
        this.store.dispatch(DB_VIEW_ACTIONS.SortMails({
            dbAccountPk: this.dbAccountPk,
            mailsBundleKey: this.mailsBundleKey,
            sorterIndex: Number(sorterIndex),
        }));
    }

    loadMore() {
        this.store.dispatch(DB_VIEW_ACTIONS.Paging({dbAccountPk: this.dbAccountPk, mailsBundleKey: this.mailsBundleKey}));
    }

    trackByMailBundleItem(
        index: number,
        {mail: {pk}}: Unpacked<Unpacked<typeof DbViewMailsComponent.prototype.items$>>,
    ) {
        return pk;
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
