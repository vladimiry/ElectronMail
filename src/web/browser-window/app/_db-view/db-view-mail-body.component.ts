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
import {BehaviorSubject, EMPTY, Observable, Subject, Subscription, combineLatest} from "rxjs";
import {Store} from "@ngrx/store";
import {delay, distinctUntilChanged, filter, map, mergeMap, pairwise, take, withLatestFrom} from "rxjs/operators";
import {equals} from "remeda";

import {ACCOUNTS_ACTIONS, DB_VIEW_ACTIONS} from "src/web/browser-window/app/store/actions";
import {DB_VIDE_MAIL_SELECTED_CLASS_NAME} from "src/web/browser-window/app/_db-view/const";
import {DbViewAbstractComponent} from "src/web/browser-window/app/_db-view/db-view-abstract.component";
import {DbViewMailComponent} from "src/web/browser-window/app/_db-view/db-view-mail.component";
import {Mail, View} from "src/shared/model/database";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/browser-window/app/store/reducers/db-view";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";
import {registerDocumentClickEventListener} from "src/shared-web/events-handling";

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

    selectingMailOnline$ = this.account$.pipe(
        map(({progress}) => progress.selectingMailOnline),
        distinctUntilChanged(),
    );

    fetchingSingleMailParams$: Observable<boolean> = this.account$.pipe(
        map((account) => Boolean(account.fetchSingleMailParams)),
        distinctUntilChanged(),
    );

    private bodyIframe?: HTMLIFrameElement;

    private elementRefClickSubscription?: ReturnType<typeof registerDocumentClickEventListener>;

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
        this.elementRefClickSubscription = registerDocumentClickEventListener(
            __ELECTRON_EXPOSURE__.buildIpcMainClient,
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
            this.selectedMail$.subscribe((selectedMail) => {
                this.renderBody(selectedMail.conversationMail);
            }),
        );

        this.subscription.add(
            combineLatest([
                this.conversationCollapsed$.pipe(
                    distinctUntilChanged(),
                ),
                this.selectedMail$.pipe(
                    map((value) => value.rootNode),
                    distinctUntilChanged(),
                ),
            ]).pipe(
                filter(([conversationCollapsed]) => !conversationCollapsed),
                delay(ONE_SECOND_MS * 0.2),
            ).subscribe(() => {
                const selectedRef = this.dbViewMailElementRefs.find((ref) => {
                    return Boolean(
                        ref.nativeElement.offsetParent
                        &&
                        ref.nativeElement.classList.contains(DB_VIDE_MAIL_SELECTED_CLASS_NAME)
                    );
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
            this.store.dispatch(ACCOUNTS_ACTIONS.FetchSingleMailSetParams({pk, mailPk: conversationMail.pk}));
        });
    }

    ngOnDestroy() {
        super.ngOnDestroy();
        this.subscription.unsubscribe();
        this.iframeBodyEventSubject$.complete();
        this.releaseBodyIframe();
    }

    private renderBody(mail: Mail) {
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
                <link rel="stylesheet" href="${__METADATA__.electronLocations.vendorsAppCssLinkHref}"/>
                <style>
                    html, body {
                        background-color: transparent;
                    }
                </style>
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
