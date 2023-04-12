import type {AfterViewInit, OnDestroy, OnInit} from "@angular/core";
import {BehaviorSubject, combineLatest, EMPTY, Observable, Subject, Subscription} from "rxjs";
import {ChangeDetectionStrategy, Component, ElementRef, Input, NgZone, QueryList, ViewChildren} from "@angular/core";
import {delay, distinctUntilChanged, filter, first, map, mergeMap, pairwise, withLatestFrom} from "rxjs/operators";
import {equals} from "remeda";
import {select} from "@ngrx/store";
import UUID from "pure-uuid";

import {ACCOUNTS_ACTIONS, DB_VIEW_ACTIONS} from "src/web/browser-window/app/store/actions";
import {buildInitialVendorsAppCssLinks} from "src/shared/util";
import {DB_VIEW_MAIL_SELECTED_CLASS_NAME} from "./const";
import {DbViewAbstractComponent} from "./db-view-abstract.component";
import {DbViewMailComponent} from "./db-view-mail.component";
import {getWebLogger} from "src/web/browser-window/util";
import {Instance} from "src/web/browser-window/app/store/reducers/db-view";
import {Mail, View} from "src/shared/model/database";
import {ONE_SECOND_MS, WEB_PROTOCOL_SCHEME} from "src/shared/const";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {registerNativeThemeReaction} from "src/web/lib/native-theme";

@Component({
    selector: "electron-mail-db-view-mail-body",
    templateUrl: "./db-view-mail-body.component.html",
    styleUrls: ["./db-view-mail-body.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailBodyComponent extends DbViewAbstractComponent implements OnInit, OnDestroy, AfterViewInit {
    @Input({required: false})
    selectedFolderData?: Instance["selectedFolderData"];

    selectedMailToggled$ = this.instance$.pipe(
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
    dbViewMailElementRefs!: QueryList<ElementRef<HTMLElement>>;

    selectingMailOnline$ = this.account$.pipe(
        map(({progress}) => progress.selectingMailOnline),
        distinctUntilChanged(),
    );

    fetchingSingleMailParams$: Observable<boolean> = this.account$.pipe(
        map((account) => Boolean(account.progress.fetchingSingleMail)),
        distinctUntilChanged(),
    );

    private bodyIframe?: HTMLIFrameElement;

    private bodyIframeSubscription?: Subscription;

    private elementRefClickSubscription?: ReturnType<typeof __ELECTRON_EXPOSURE__.registerDocumentClickEventListener>;

    private shouldUseDarkColors?: boolean;

    private readonly subscription = new Subscription();

    private readonly bodyIframeEventHandler = (event: Event): void => {
        this.zone.run(() => {
            this.iframeBodyEventSubject$.next(event);
        });
    };

    private readonly bodyIframeEventArgs = ["click"].map((event) => {
        return {
            event,
            handler: this.bodyIframeEventHandler,
        };
    });

    private readonly logger = getWebLogger(__filename, nameof(DbViewMailBodyComponent));

    constructor(
        private elementRef: ElementRef<HTMLElement>,
        private zone: NgZone,
    ) {
        super();
    }

    ngOnInit(): void {
        {
            this.elementRefClickSubscription = __ELECTRON_EXPOSURE__.registerDocumentClickEventListener(
                this.elementRef.nativeElement,
                this.logger,
            );
            this.subscription.add({unsubscribe: this.elementRefClickSubscription.unsubscribe});
        }

        this.subscription.add(
            this.store
                .pipe(select(OptionsSelectors.FEATURED.shouldUseDarkColors))
                .subscribe((shouldUseDarkColors) => {
                    this.shouldUseDarkColors = shouldUseDarkColors;
                }),
        );
    }

    ngAfterViewInit(): void {
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
            this.selectedMailToggled$.subscribe((selectedMail) => {
                this.renderBody(selectedMail.conversationMail);
            }),
        );

        this.subscription.add(
            combineLatest([
                this.conversationCollapsed$.pipe(
                    distinctUntilChanged(),
                ),
                this.selectedMailToggled$.pipe(
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
                        ref.nativeElement.classList.contains(DB_VIEW_MAIL_SELECTED_CLASS_NAME)
                    );
                });
                if (selectedRef) {
                    selectedRef.nativeElement.scrollIntoView({behavior: "smooth", block: "start"});
                }
            }),
        );
    }

    isEmptyNodes(nodes: View.ConversationNode[]): boolean {
        return nodes.length === 1 && !(nodes[0]?.mail);
    }

    selectConversationMail({pk: mailPk}: Pick<Mail, "pk">): void {
        this.store.dispatch(DB_VIEW_ACTIONS.SelectConversationMailRequest({webAccountPk: this.webAccountPk, mailPk}));
    }

    toggleConversationCollapsing(): void {
        this.conversationCollapsed$.next(!this.conversationCollapsed$.value);
    }

    selectMailOnline(): void {
        // TODO consider introducing unique id of the selecting operation
        this.selectingMailOnline$.pipe(
            pairwise(),
            filter((prev, curr) => Boolean(prev) && !curr),
            first(),
        ).subscribe(() => {
            this.store.dispatch(ACCOUNTS_ACTIONS.ToggleDatabaseView({login: this.webAccountPk.login, forced: {databaseView: false}}));
        });

        this.selectedMailToggled$
            .pipe(first())
            .subscribe(({conversationMail: {id, mailFolderIds, conversationEntryPk}}) => {
                this.store.dispatch(ACCOUNTS_ACTIONS.SelectMailOnline({
                    pk: this.webAccountPk,
                    mail: {id, mailFolderIds, conversationEntryPk},
                    selectedFolderId: (this.selectedFolderData ?? {id: null}).id,
                }));
            });
    }

    reDownload(): void {
        this.webAccountPk$.pipe(
            withLatestFrom(
                this.selectedMailToggled$.pipe(
                    map((selectedMail) => selectedMail.conversationMail),
                ),
            ),
            first(),
        ).subscribe(([pk, conversationMail]) => {
            this.store.dispatch(ACCOUNTS_ACTIONS.FetchSingleMail({pk, mailPk: conversationMail.pk}));
        });
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.subscription.unsubscribe();
        this.iframeBodyEventSubject$.complete();
        this.releaseBodyIframe();

    }

    private renderBody(mail: Mail): void {
        // TODO cache resolved DOM elements
        const container = this.elementRef.nativeElement.getElementsByClassName("body-container").item(0);

        if (!container) {
            throw new Error("Failed to resolve body container element");
        }

        // WARN: release the iframe first and only then reset the html content
        this.releaseBodyIframe();
        container.innerHTML = "";

        if (mail.failedDownload) {
            return;
        }

        const iframeCspInlineStyleNonce = new UUID(4).format();
        const iframeCsp = `default-src 'none'; style-src ${WEB_PROTOCOL_SCHEME}: 'nonce-${iframeCspInlineStyleNonce}'`;

        (() => {
            delete this.bodyIframe;
            const iframe = document.createElement("iframe");

            iframe.setAttribute(
                "sandbox",
                "allow-same-origin", // exclusion required to be able to call "document.open()" on iframe
            );
            iframe.setAttribute("csp", iframeCsp);

            this.bodyIframe = iframe;
        })();

        // WARN: access "contentWindow" only having "appendChild" executed before
        const {contentWindow} = container.appendChild(this.bodyIframe);

        if (!contentWindow) {
            throw new Error(`Failed to prepare email body rendering "iframe"`);
        }

        const headInjection = buildInitialVendorsAppCssLinks(
            __METADATA__.electronLocations.vendorsAppCssLinkHrefs,
            this.shouldUseDarkColors,
        );

        contentWindow.document.open();
        contentWindow.document.write(`
            <html>
            <head>
                <meta http-equiv="Content-Security-Policy" content="${iframeCsp}">
                <meta http-equiv="X-Content-Security-Policy" content="${iframeCsp}">
                ${headInjection}
                <style nonce="${iframeCspInlineStyleNonce}">
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

        this.bodyIframeSubscription = registerNativeThemeReaction(__ELECTRON_EXPOSURE__, {windowProxy: contentWindow});

        this.bodyIframeEventArgs.forEach(({event, handler}) => {
            contentWindow.document.addEventListener(event, handler);
        });
    }

    private releaseBodyIframe(): void {
        if (!this.bodyIframe) {
            return;
        }

        const {contentWindow} = this.bodyIframe;

        if (contentWindow) {
            this.bodyIframeEventArgs.forEach(({event, handler}) => {
                contentWindow.document.removeEventListener(event, handler);
            });
        }

        this.bodyIframeSubscription?.unsubscribe();

        this.bodyIframe.remove();
    }
}
