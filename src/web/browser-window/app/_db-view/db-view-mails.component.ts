import {ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, OnInit} from "@angular/core";
import {Observable, Subscription, combineLatest, fromEvent} from "rxjs";
import {Store, select} from "@ngrx/store";
import {distinctUntilChanged, map, mergeMap, take, tap, withLatestFrom} from "rxjs/operators";

import {ACCOUNTS_ACTIONS, DB_VIEW_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {DB_VIEW_MAIL_DATA_PK_ATTR_NAME, DB_VIEW_MAIL_SELECTED_CLASS_NAME} from "src/web/browser-window/app/_db-view/const";
import {DbViewAbstractComponent} from "src/web/browser-window/app/_db-view/db-view-abstract.component";
import {Folder, Mail} from "src/shared/model/database/view";
import {MailsBundleKey, State} from "src/web/browser-window/app/store/reducers/db-view";
import {PROTONMAIL_MAILBOX_IDENTIFIERS} from "src/shared/model/database";
import {VIRTUAL_UNREAD_FOLDER_TYPE} from "src/shared/constants";

// TODO read "electron-mail-db-view-mail" from the DbViewMailComponent.selector property
const mailComponentTagName = "electron-mail-db-view-mail".toUpperCase();

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
            if (element.tagName === mailComponentTagName) {
                return element;
            }
            element = element.parentElement;
        }
        return null;
    }

    private static resolveMailPk(mailElement: Element): Mail["pk"] {
        const result = mailElement.getAttribute(DB_VIEW_MAIL_DATA_PK_ATTR_NAME);

        if (!result) {
            throw new Error(`Failed to resolve "pk" of mail element`);
        }

        return result;
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

    moveToFolders$: Observable<Folder[]> = (
        () => { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
            const excludePks: ReadonlySet<Folder["pk"]> = new Set([
                PROTONMAIL_MAILBOX_IDENTIFIERS["All Drafts"],
                PROTONMAIL_MAILBOX_IDENTIFIERS["All Sent"],
                PROTONMAIL_MAILBOX_IDENTIFIERS["All Mail"],
                PROTONMAIL_MAILBOX_IDENTIFIERS.Search,
                PROTONMAIL_MAILBOX_IDENTIFIERS.Label,
            ]);
            const staticFilter = (item: Folder): boolean => {
                return (
                    item.exclusive > 0
                    &&
                    !excludePks.has(item.pk)
                    &&
                    item.mailFolderId !== VIRTUAL_UNREAD_FOLDER_TYPE
                );
            };
            return combineLatest([
                this.instance$.pipe(
                    map((value) => value.folders),
                    distinctUntilChanged(),
                    map(({custom, system}) => ([...system, ...custom])),
                    map((items) => items.filter(staticFilter)),
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
        }
    )();

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
        private elementRef: ElementRef<Element>,
        store: Store<State>,
    ) {
        super(store);
    }

    ngOnInit(): void {
        // TODO use @HostListener approach as soon as https://github.com/angular/angular/issues/19878 gets resolved
        this.subscription.add(
            fromEvent<MouseEvent>(this.elementRef.nativeElement, "click").subscribe((event) => {
                const target = event.target as Element;
                const mailElement = DbViewMailsComponent.resolveMailComponentElement(target);

                if (!mailElement) {
                    return;
                }

                const mailPk: Mail["pk"] | null = mailElement.getAttribute("data-pk");

                if (mailPk) {
                    this.store.dispatch(DB_VIEW_ACTIONS.SelectMailRequest({dbAccountPk: this.dbAccountPk, mailPk}));
                }
            }),
        );

        this.subscription.add(
            fromEvent<KeyboardEvent>(document, "keydown")
                .pipe(
                    withLatestFrom(
                        this.store.pipe(
                            select(AccountsSelectors.FEATURED.selectedLogin),
                        ),
                    )
                )
                .subscribe(([{keyCode}, selectedLogin]) => {
                    // only processing keydown event on selected account
                    // (subscribed globally / to document)
                    if (this.dbAccountPk.login !== selectedLogin) {
                        // WARN only one mails list component instance should to be rendered per account
                        // (subscribed globally / to document)
                        return;
                    }

                    const up = keyCode === 38;
                    const down = keyCode === 40;

                    if (!up && !down) {
                        return;
                    }

                    // TODO cache "selected" element on selection change
                    const selected = this.resolveSelectedMailElement();

                    if (!selected) {
                        // TODO cache ":first-of-type" element on rendered mails list change
                        const firstMail = this.elementRef.nativeElement.querySelector(`${mailComponentTagName}:first-of-type`);

                        if (firstMail) {
                            // selecting first mail if none has been selected before
                            this.store.dispatch(
                                DB_VIEW_ACTIONS.SelectMailRequest({
                                    dbAccountPk: this.dbAccountPk,
                                    mailPk: DbViewMailsComponent.resolveMailPk(firstMail),
                                }),
                            );
                        }

                        return;
                    }

                    const toSelect: ChildNode | ElementRef | null = up
                        ? selected.previousSibling
                        : selected.nextSibling;

                    if (!toSelect) {
                        return;
                    }

                    if (
                        up
                        &&
                        // TODO cache ":first-of-type" element on rendered mails list change
                        selected === this.elementRef.nativeElement.querySelector(`${mailComponentTagName}:first-of-type`)
                    ) {
                        return;
                    }

                    if (
                        down
                        &&
                        // TODO cache ":last-of-type" element on rendered mails list change
                        selected === this.elementRef.nativeElement.querySelector(`${mailComponentTagName}:last-of-type`)
                    ) {
                        return;
                    }

                    // TODO TS: use type-guard function to resolve/narrow Node as Element
                    if (
                        toSelect.nodeType !== Node.ELEMENT_NODE
                        ||
                        (toSelect as Element).tagName !== mailComponentTagName
                    ) {
                        throw new Error("Failed to resolve sibling mail element");
                    }

                    this.store.dispatch(
                        DB_VIEW_ACTIONS.SelectMailRequest({
                            dbAccountPk: this.dbAccountPk,
                            mailPk: DbViewMailsComponent.resolveMailPk(toSelect as Element),
                        }),
                    );
                }),
        );

        this.subscription.add(
            this.instance$.pipe(
                map((value) => value.selectedMail),
                distinctUntilChanged(),
            ).subscribe((selectedMail) => {
                const toDeselect = this.resolveSelectedMailElement();
                const toSelect: Element | null = selectedMail
                    ? this.elementRef.nativeElement
                        .querySelector(`${mailComponentTagName}[${DB_VIEW_MAIL_DATA_PK_ATTR_NAME}='${selectedMail.listMailPk}']`)
                    : null;

                if (toDeselect) {
                    toDeselect.classList.remove(DB_VIEW_MAIL_SELECTED_CLASS_NAME);
                }
                if (toSelect) {
                    toSelect.classList.add(DB_VIEW_MAIL_SELECTED_CLASS_NAME);
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

    private resolveSelectedMailElement(): Element | null {
        return (this.elementRef.nativeElement)
            .querySelector(`${mailComponentTagName}.${DB_VIEW_MAIL_SELECTED_CLASS_NAME}`);
    }
}
