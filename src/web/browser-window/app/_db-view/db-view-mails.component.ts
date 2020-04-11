import {ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, OnInit} from "@angular/core";
import {Observable, Subscription, combineLatest, fromEvent} from "rxjs";
import {Store} from "@ngrx/store";
import {distinctUntilChanged, map, mergeMap, take, tap, withLatestFrom} from "rxjs/operators";
import {sortBy} from "remeda";

import {ACCOUNTS_ACTIONS, DB_VIEW_ACTIONS} from "src/web/browser-window/app/store/actions";
import {DB_VIDE_MAIL_SELECTED_CLASS_NAME} from "src/web/browser-window/app/_db-view/const";
import {DbViewAbstractComponent} from "src/web/browser-window/app/_db-view/db-view-abstract.component";
import {Folder, Mail} from "src/shared/model/database/view";
import {MailsBundleKey, State} from "src/web/browser-window/app/store/reducers/db-view";
import {PROTONMAIL_MAILBOX_IDENTIFIERS} from "src/shared/model/database";

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

    mailsBundleKey$: Observable<MailsBundleKey> = this.ngChangesObservable("mailsBundleKey").pipe(
        distinctUntilChanged(),
    );

    mailsBundle$ = this.mailsBundleKey$.pipe(
        mergeMap((mailsBundleKey) => this.instance$.pipe(
            map((instance) => instance[mailsBundleKey]),
            distinctUntilChanged(),
        )),
    );

    plainMailsBundle$ = this.mailsBundleKey$.pipe(
        mergeMap((mailsBundleKey) => this.instance$.pipe(
            map((instance) => {
                const key = mailsBundleKey === "folderConversationsBundle"
                    ? "folderMailsBundle"
                    : mailsBundleKey;
                return instance[key];
            }),
            distinctUntilChanged(),
        )),
    );

    title$ = this.mailsBundle$.pipe(
        map(({title}) => title),
        distinctUntilChanged(),
    );

    items$ = this.mailsBundle$.pipe(
        map(({items}) => items),
        distinctUntilChanged(),
        tap(this.markDirty.bind(this)),
    );

    plainItems$ = this.plainMailsBundle$.pipe(
        map(({items}) => items),
        distinctUntilChanged(),
        tap(this.markDirty.bind(this)),
    );

    paging$ = this.mailsBundle$.pipe(
        map(({paging}) => paging),
        distinctUntilChanged(),
    );

    sorting$ = this.mailsBundle$.pipe(
        map((mailsBundle) => ({sorters: mailsBundle.sorters, sorterIndex: mailsBundle.sorterIndex})),
        distinctUntilChanged(),
    );

    unreadCount$: Observable<number> = this.plainItems$.pipe(
        map((items) => {
            return items.reduce(
                (acc, {mail}) => acc + Number(mail.unread),
                0,
            );
        }),
        distinctUntilChanged(),
    );

    makeAllReadInProgress$: Observable<boolean> = this.account$.pipe(
        map((account) => {
            return account
                ? Boolean(account.makeReadMailParams)
                : false;
        }),
    );

    makeAllReadButtonLocked$: Observable<boolean> = combineLatest([
        this.unreadCount$,
        this.makeAllReadInProgress$,
        this.onlineAndSignedIn$,
    ]).pipe(
        map(([unreadCount, inProgress, onlineAndSignedIn]) => {
            return unreadCount < 1 || inProgress || !onlineAndSignedIn;
        }),
        distinctUntilChanged(),
    );

    plainItemsCount$: Observable<number> = this.plainItems$.pipe(
        map(({length}) => length),
        distinctUntilChanged(),
    );

    setFolderInProgress$: Observable<boolean> = this.account$.pipe(
        map((account) => {
            return account
                ? Boolean(account.setMailFolderParams)
                : false;
        }),
    );

    setFolderButtonLocked$: Observable<boolean> = combineLatest([
        this.plainItemsCount$,
        this.setFolderInProgress$,
        this.onlineAndSignedIn$,
    ]).pipe(
        map(([count, inProgress, onlineAndSignedIn]) => {
            return count < 1 || inProgress || !onlineAndSignedIn;
        }),
        distinctUntilChanged(),
    );

    moveToFolders$: Observable<Folder[]> = (() => {
        const excludePks: ReadonlySet<Folder["pk"]> = new Set([
            PROTONMAIL_MAILBOX_IDENTIFIERS["All Drafts"],
            PROTONMAIL_MAILBOX_IDENTIFIERS["All Sent"],
            PROTONMAIL_MAILBOX_IDENTIFIERS["All Mail"],
            PROTONMAIL_MAILBOX_IDENTIFIERS.Search,
            PROTONMAIL_MAILBOX_IDENTIFIERS.Label,
        ])
        const staticFilter = (item: Folder): boolean => {
            return (
                item.exclusive > 0
                &&
                !excludePks.has(item.pk)
            );
        };
        return combineLatest([
            this.instance$.pipe(
                map((value) => value.folders),
                distinctUntilChanged(),
                map(({custom, system}) => ([...custom, ...system])),
                map((items) => items.filter(staticFilter)),
                map((items) => sortBy([...items], ({name}) => name)),
            ),
            this.instance$.pipe(
                map((value) => value.selectedFolderData),
                distinctUntilChanged(),
            ),
        ]).pipe(
            map(([items, selectedFolderData]) => {
                const excludeFolderPk = this.mailsBundleKey === "searchMailsBundle"
                    ? null // no excluding for the full-text search result lit
                    : selectedFolderData?.pk;
                return items.filter(({pk}) => pk !== excludeFolderPk);
            }),
        );
    })();

    private subscription = new Subscription();

    private _uid?: string;

    @Input()
    set uid(value: string | undefined) {
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

                const mailPk: Mail["pk"] | undefined
                    = mailElement.getAttribute("data-pk") as any; // eslint-disable-line @typescript-eslint/no-explicit-any

                if (mailPk) {
                    this.store.dispatch(DB_VIEW_ACTIONS.SelectMailRequest({dbAccountPk: this.dbAccountPk, mailPk}));
                }
            }),
        );

        this.subscription.add(
            this.instance$.pipe(
                map((value) => value.selectedMail),
                distinctUntilChanged(),
            ).subscribe((selectedMail) => {
                const selectedClassName = DB_VIDE_MAIL_SELECTED_CLASS_NAME;
                const el = this.elementRef.nativeElement as Element;
                const toDeselect = el.querySelector(`${mailComponentTagName}.${selectedClassName}`);
                const toSelect: Element | null = selectedMail
                    ? el.querySelector(`${mailComponentTagName}[data-pk='${selectedMail.listMailPk}']`)
                    : null;

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

    sortChange(sorterIndex: number | string): void {
        this.store.dispatch(DB_VIEW_ACTIONS.SortMails({
            dbAccountPk: this.dbAccountPk,
            mailsBundleKey: this.mailsBundleKey,
            sorterIndex: Number(sorterIndex),
        }));
    }

    loadMore(): void {
        this.store.dispatch(DB_VIEW_ACTIONS.Paging({dbAccountPk: this.dbAccountPk, mailsBundleKey: this.mailsBundleKey}));
    }

    trackByMailBundleItem(
        ...[, {mail: {pk}}]: readonly [number, Unpacked<Unpacked<typeof DbViewMailsComponent.prototype.items$>>]
    ): string {
        return pk;
    }

    makeAllRead(): void {
        this.plainItems$
            .pipe(
                withLatestFrom(this.dbAccountPk$),
                take(1),
            )
            .subscribe(([items, pk]) => {
                const messageIds = items
                    .filter((item) => item.mail.unread)
                    .map((item) => item.mail.id);
                if (!messageIds.length) {
                    return;
                }
                this.store.dispatch(
                    ACCOUNTS_ACTIONS.MakeMailReadSetParams({pk, messageIds}),
                );
            });
    }

    setFolder(folderId: Folder["id"]): void {
        this.plainItems$
            .pipe(
                withLatestFrom(this.dbAccountPk$),
                take(1),
            )
            .subscribe(([items, pk]) => {
                const messageIds = items.map((item) => item.mail.id);
                if (!messageIds.length) {
                    return;
                }
                this.store.dispatch(
                    ACCOUNTS_ACTIONS.SetMailFolderParams({pk, folderId, messageIds}),
                );
            });
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
