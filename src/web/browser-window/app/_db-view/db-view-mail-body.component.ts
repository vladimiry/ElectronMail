import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    Input,
    NgZone,
    OnDestroy,
    OnInit,
    QueryList,
    ViewChildren,
} from "@angular/core";
import {BehaviorSubject, EMPTY, Subject, Subscription, combineLatest, fromEvent, merge, race, throwError, timer} from "rxjs";
import {Store, select} from "@ngrx/store";
import {delay, distinctUntilChanged, filter, map, mergeMap, pairwise, startWith, take, withLatestFrom} from "rxjs/operators";
import {equals} from "ramda";

import {ACCOUNTS_ACTIONS, DB_VIEW_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors, OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {DbViewAbstractComponent} from "src/web/browser-window/app/_db-view/db-view-abstract.component";
import {DbViewMailComponent} from "src/web/browser-window/app/_db-view/db-view-mail.component";
import {Mail, View} from "src/shared/model/database";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/browser-window/app/store/reducers/db-view";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";

@Component({
    selector: "electron-mail-db-view-mail-body",
    templateUrl: "./db-view-mail-body.component.html",
    styleUrls: ["./db-view-mail-body.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailBodyComponent extends DbViewAbstractComponent implements OnInit, OnDestroy, AfterViewInit {
    @Input()
    selectedFolderData?: View.Folder;

    selectedMail$ = this.instance$.pipe(
        map((value) => value.selectedMail),
        mergeMap((value) => value ? [value] : EMPTY),
        distinctUntilChanged((prev, curr) => (
            prev.rootNode.entryPk === curr.rootNode.entryPk
            &&
            prev.conversationMail.pk === curr.conversationMail.pk
            &&
            prev.conversationMail.body === curr.conversationMail.body
            &&
            equals(prev.conversationMail.failedDownload, curr.conversationMail.failedDownload)
        )),
    );

    iframeBodyEventSubject$ = new Subject<Event>();

    conversationCollapsed$ = new BehaviorSubject<boolean>(true);

    @ViewChildren(DbViewMailComponent, {read: ElementRef})
    dbViewMailElementRefs!: QueryList<ElementRef>;

    account$ = this.dbAccountPk$.pipe(
        mergeMap(({login}) => this.store.pipe(
            select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
            mergeMap((value) => value ? [value] : EMPTY),
            distinctUntilChanged(),
        )),
    );

    onlineAndLoggedIn$ = combineLatest(
        this.account$.pipe(
            map(({notifications}) => notifications.loggedIn),
            distinctUntilChanged(),
        ),
        merge(
            fromEvent(window, "online"),
            fromEvent(window, "offline"),
        ).pipe(
            map(() => navigator.onLine),
            startWith(navigator.onLine),
        ),
    ).pipe(
        map(([loggedIn, online]) => {
            return loggedIn && online;
        }),
    );

    selectingMailOnline$ = this.account$.pipe(
        map(({progress}) => progress.selectingMailOnline),
        distinctUntilChanged(),
    );

    fetchingSingleMailParams$ = this.account$.pipe(
        map((account) => Boolean(account.fetchSingleMailParams)),
        distinctUntilChanged(),
    );

    private bodyIframe?: HTMLIFrameElement;

    private elementRefClickSubscription?: ReturnType<typeof __ELECTRON_EXPOSURE__.registerDocumentClickEventListener>;

    private readonly subscription = new Subscription();

    private readonly bodyIframeEventHandler = ((event: Event) => {
        this.zone.run(() => this.iframeBodyEventSubject$.next(event));
    });

    private readonly bodyIframeEventArgs = ["click"].map((event) => ({
        event,
        handler: this.bodyIframeEventHandler,
    }));

    private readonly logger = getZoneNameBoundWebLogger();

    constructor(
        store: Store<State>,
        private elementRef: ElementRef,
        private zone: NgZone,
    ) {
        super(store);
    }

    ngOnInit() {
        this.elementRefClickSubscription = __ELECTRON_EXPOSURE__.registerDocumentClickEventListener(
            this.elementRef.nativeElement,
            this.logger,
        );
        this.subscription.add({unsubscribe: this.elementRefClickSubscription.unsubscribe});
    }

    ngAfterViewInit() {
        this.subscription.add(
            this.iframeBodyEventSubject$.pipe(
                filter(({type}) => type === "click"),
                map((event) => event as MouseEvent),
            ).subscribe(async (event) => {
                if (this.elementRefClickSubscription) {
                    await this.elementRefClickSubscription.eventHandler(event);
                }
            }),
        );

        this.subscription.add(
            race(
                this.store.pipe(
                    select(OptionsSelectors.FEATURED.electronLocations),
                    map((value) => {
                        if (!value) {
                            throw new Error(`"electronLocations" is expected to be defined`);
                        }
                        return value;
                    }),
                    take(1),
                ),
                timer(ONE_SECOND_MS).pipe(
                    mergeMap(() => throwError(new Error(`Failed to resolve "electronLocations" value`))),
                ),
            ).subscribe(({vendorsAppCssLinkHref}) => {
                this.subscription.add(
                    this.selectedMail$.subscribe((selectedMail) => {
                        this.renderBody(selectedMail.conversationMail, {vendorsAppCssLinkHref});
                    }),
                );
            }),
        );

        this.subscription.add(
            combineLatest(
                this.conversationCollapsed$.pipe(
                    distinctUntilChanged(),
                ),
                this.selectedMail$.pipe(
                    map((value) => value.rootNode),
                    distinctUntilChanged(),
                ),
            ).pipe(
                filter(([conversationCollapsed]) => !conversationCollapsed),
                delay(ONE_SECOND_MS * 0.2),
            ).subscribe(() => {
                const selectedRef = this.dbViewMailElementRefs.find((ref) => {
                    return ref.nativeElement.offsetParent && String(ref.nativeElement.getAttribute("selected")) === "1";
                });
                if (selectedRef) {
                    selectedRef.nativeElement.scrollIntoView({behavior: "smooth", block: "start"});
                }
            }),
        );
    }

    isEmptyNodes(nodes: View.ConversationNode[]): boolean {
        return nodes.length === 1 && !nodes[0].mail;
    }

    selectConversationMail({pk: mailPk}: Pick<Mail, "pk">) {
        this.store.dispatch(DB_VIEW_ACTIONS.SelectConversationMailRequest({dbAccountPk: this.dbAccountPk, mailPk}));
    }

    toggleConversationCollapsing() {
        this.conversationCollapsed$.next(!this.conversationCollapsed$.value);
    }

    selectMailOnline() {
        // TODO consider introducing unique id of the selecting operation
        this.selectingMailOnline$.pipe(
            pairwise(),
            filter((prev, curr) => Boolean(prev) && !Boolean(curr)),
            take(1),
        ).subscribe(() => {
            this.store.dispatch(ACCOUNTS_ACTIONS.ToggleDatabaseView({login: this.dbAccountPk.login, forced: {databaseView: false}}));
        });

        this.selectedMail$
            .pipe(take(1))
            .subscribe(({conversationMail: {id, mailFolderIds, conversationEntryPk}}) => {
                const {selectedFolderData} = this;

                if (selectedFolderData && mailFolderIds.includes(selectedFolderData.mailFolderId)) {
                    mailFolderIds = [selectedFolderData.mailFolderId];
                }

                // TODO send only one "mailFolderId" value that contains a minimum items count
                this.store.dispatch(ACCOUNTS_ACTIONS.SelectMailOnline({
                    pk: this.dbAccountPk,
                    mail: {id, mailFolderIds, conversationEntryPk},
                }));
            });
    }

    reDownload() {
        this.dbAccountPk$.pipe(
            withLatestFrom(
                this.selectedMail$.pipe(
                    map((selectedMail) => selectedMail.conversationMail),
                ),
            ),
            take(1),
        ).subscribe(([pk, conversationMail]) => {
            this.store.dispatch(ACCOUNTS_ACTIONS.SetFetchSingleMailParams({pk, mailPk: conversationMail.pk}));
        });
    }

    ngOnDestroy() {
        super.ngOnDestroy();
        this.subscription.unsubscribe();
        this.iframeBodyEventSubject$.complete();
        this.releaseBodyIframe();
    }

    private renderBody(mail: Mail, {vendorsAppCssLinkHref}: { vendorsAppCssLinkHref: string }) {
        // TODO cache resolved DOM elements
        const [container] = this.elementRef.nativeElement.getElementsByClassName("body-container");

        // WARN: release the iframe first and only then reset the html content
        this.releaseBodyIframe();
        container.innerHTML = "";

        if (mail.failedDownload) {
            return;
        }

        // WARN: access "contentWindow" only having "appendChild" executed before
        const {contentWindow} = container.appendChild(this.bodyIframe = document.createElement("iframe"));

        if (!contentWindow) {
            return;
        }

        contentWindow.document.open();
        contentWindow.document.write(`
            <html>
            <head>
                <link rel="stylesheet" href="${vendorsAppCssLinkHref}"/>
            </head>
            <body>
                ${mail.body}
            </body>
            </html>
        `);
        contentWindow.document.close();

        this.bodyIframeEventArgs.forEach(({event, handler}) => {
            contentWindow.document.addEventListener(event, handler);
        });
    }

    private releaseBodyIframe() {
        if (!this.bodyIframe) {
            return;
        }

        const {contentWindow} = this.bodyIframe;

        if (contentWindow) {
            this.bodyIframeEventArgs.forEach(({event, handler}) => {
                contentWindow.document.removeEventListener(event, handler);
            });
        }

        this.bodyIframe.remove();
    }
}
