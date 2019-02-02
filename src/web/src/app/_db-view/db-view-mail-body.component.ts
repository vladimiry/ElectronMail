import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    HostListener,
    Input,
    NgZone,
    OnDestroy,
    QueryList,
    ViewChildren,
} from "@angular/core";
import {BehaviorSubject, EMPTY, Subject, Subscription, combineLatest, fromEvent, merge} from "rxjs";
import {Store, select} from "@ngrx/store";
import {delay, distinctUntilChanged, filter, map, mergeMap, pairwise, startWith, take} from "rxjs/operators";

import {ACCOUNTS_ACTIONS, DB_VIEW_ACTIONS, NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";
import {AccountsSelectors} from "src/web/src/app/store/selectors";
import {DbViewAbstractComponent} from "src/web/src/app/_db-view/db-view-abstract.component";
import {DbViewMailComponent} from "src/web/src/app/_db-view/db-view-mail.component";
import {Mail, View} from "src/shared/model/database";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/src/app/store/reducers/db-view";

@Component({
    selector: "email-securely-app-db-view-mail-body",
    templateUrl: "./db-view-mail-body.component.html",
    styleUrls: ["./db-view-mail-body.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailBodyComponent extends DbViewAbstractComponent implements OnDestroy, AfterViewInit {
    @Input()
    selectedFolderData?: View.Folder;

    selectedMail$ = this.instance$.pipe(
        map((value) => value.selectedMail),
        mergeMap((value) => value ? [value] : EMPTY),
        distinctUntilChanged((prev, curr) => (
            prev.rootNode.entryPk === curr.rootNode.entryPk
            &&
            prev.conversationMail.pk === curr.conversationMail.pk
        )),
    );

    iframeBodyEventSubject$ = new Subject<Event>();

    conversationCollapsed$: BehaviorSubject<boolean> = new BehaviorSubject(true);

    @ViewChildren(DbViewMailComponent, {read: ElementRef})
    dbViewMailElementRefs!: QueryList<ElementRef>;

    account$ = this.dbAccountPk$.pipe(
        mergeMap(({login}) => this.store.pipe(
            select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
            mergeMap((value) => value ? [value] : EMPTY),
            distinctUntilChanged(),
        )),
    );

    selectingMailOnlineAvailable$ = combineLatest(
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

    private bodyIframe?: HTMLIFrameElement;

    private readonly subscription = new Subscription();

    private readonly bodyIframeEventHandler = ((event: Event) => {
        this.zone.run(() => this.iframeBodyEventSubject$.next(event));
    });

    private readonly bodyIframeEventArgs = ["click"].map((event) => ({
        event,
        handler: this.bodyIframeEventHandler,
    }));

    constructor(
        store: Store<State>,
        private elementRef: ElementRef,
        private zone: NgZone,
    ) {
        super(store);
    }

    ngAfterViewInit() {
        this.subscription.add(
            this.iframeBodyEventSubject$.pipe(
                filter(({type}) => type === "click"),
            ).subscribe((event) => {
                this.click(event);
            }),
        );

        this.subscription.add(
            this.selectedMail$.subscribe((value) => {
                this.renderBody(value.conversationMail);
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

    @HostListener("click", ["$event"])
    click(event: Event) {
        const {element, link, href} = this.resolveLinkHref(event.target as Element);

        if (!link || element.classList.contains("prevent-default-event")) {
            return;
        }

        event.preventDefault();

        if (!href) {
            return;
        }

        this.store.dispatch(NAVIGATION_ACTIONS.OpenExternal({url: href}));
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

    ngOnDestroy() {
        super.ngOnDestroy();
        this.subscription.unsubscribe();
        this.iframeBodyEventSubject$.complete();
        this.releaseBodyIframe();
    }

    private renderBody(mail: Mail) {
        this.releaseBodyIframe();

        // TODO cache resolved DOM elements
        const iframe = this.bodyIframe = document.createElement("iframe");
        const container = this.elementRef.nativeElement.getElementsByClassName("body-container")[0];

        container.innerHTML = "";
        container.appendChild(iframe);

        // WARN: access "contentWindow" only having "appendChild" executed before
        const {contentWindow} = iframe;

        if (!contentWindow) {
            return;
        }

        const vendorLink = this.resolveVendorLinkTag();

        contentWindow.document.open();
        contentWindow.document.write(`
            <html>
            <head>
                ${vendorLink && vendorLink.outerHTML}
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

    private resolveVendorLinkTag(): HTMLLinkElement | undefined {
        // TODO use "vendors~app.css" by all the consumers as a shared constant (consumers: app,webpack)
        // TODO cache resolved DOM elements
        return ([].slice.call(document.querySelectorAll("html > head > link[rel='stylesheet']")) as HTMLLinkElement[])
            .find((link) => link.href.includes("vendors~app.css"));
    }

    private resolveLinkHref(element: Element): { element: Element, link?: boolean; href?: string } {
        const parentScanState: {
            element: (Node & ParentNode) | null | Element;
            link?: boolean;
            iterationAllowed: number;
        } = {element, iterationAllowed: 3};

        while (parentScanState.element && parentScanState.iterationAllowed) {
            if (
                parentScanState.element.nodeType === Node.ELEMENT_NODE
                &&
                ("tagName" in parentScanState.element && parentScanState.element.tagName.toLowerCase() === "a")
            ) {
                parentScanState.link = true;
                break;
            }
            parentScanState.element = parentScanState.element.parentNode;
            parentScanState.iterationAllowed--;
        }

        const result: ReturnType<typeof DbViewMailBodyComponent.prototype.resolveLinkHref> = {
            element: parentScanState.element as Element,
            link: parentScanState.link,
        };

        if (!result.link) {
            return result;
        }

        result.href = (result.element as HTMLLinkElement).href;

        return result;
    }
}
