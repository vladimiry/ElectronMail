import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    EventEmitter,
    HostListener,
    Input,
    NgZone,
    OnDestroy,
    OnInit,
    Output,
    QueryList,
    ViewChildren,
} from "@angular/core";
import {BehaviorSubject} from "rxjs/BehaviorSubject";
import {Observable, Subject, Subscription, combineLatest, fromEvent, merge} from "rxjs";
import {Store} from "@ngrx/store";
import {UnionOf} from "@vladimiry/unionize";
import {delay, distinctUntilChanged, filter, map} from "rxjs/operators";

import {DB_VIEW_ACTIONS, NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";
import {DbViewMailComponent} from "src/web/src/app/_db-view/db-view-mail.component";
import {Mail, View} from "src/shared/model/database";
import {NgChangesObservableComponent} from "src/web/src/app/components/ng-changes-observable.component";
import {ONE_SECOND_MS} from "src/shared/constants";
import {Omit} from "src/shared/types";
import {State} from "src/web/src/app/store/reducers/db-view";

@Component({
    selector: "email-securely-app-db-view-mail-body",
    templateUrl: "./db-view-mail-body.component.html",
    styleUrls: ["./db-view-mail-body.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailBodyComponent extends NgChangesObservableComponent implements OnDestroy, OnInit, AfterViewInit {
    @Input()
    mailData!: Omit<Extract<UnionOf<typeof DB_VIEW_ACTIONS>, { type: "SelectListMailToDisplay" }>["payload"], "dbAccountPk">;

    hoveredHref$?: Observable<string | boolean>;

    conversationCollapsed$: BehaviorSubject<boolean> = new BehaviorSubject(true);

    @Output()
    selectRootNodeMailToDisplayHandler = new EventEmitter<Mail["pk"]>();

    @ViewChildren(DbViewMailComponent, {read: ElementRef})
    dbViewMailElementRefs!: QueryList<ElementRef>;

    private bodyIframe?: HTMLIFrameElement;

    private readonly subscription = new Subscription();

    private readonly bodyIframeEventSubject$ = new Subject<Event>();

    private readonly bodyIframeEventHandler = ((event: Event) => {
        this.zone.run(() => this.bodyIframeEventSubject$.next(event));
    });

    private readonly bodyIframeEventArgs = ["click", "mouseover", "mouseout"].map((event) => ({
        event,
        handler: this.bodyIframeEventHandler,
    }));

    constructor(
        private elementRef: ElementRef,
        private store: Store<State>,
        private zone: NgZone,
    ) {
        super();
    }

    ngOnInit(): void {
        this.hoveredHref$ = merge(
            merge(
                fromEvent(this.elementRef.nativeElement as HTMLElement, "mouseover"),
                this.bodyIframeEventSubject$.pipe(
                    filter(({type}) => type === "mouseover"),
                ),
            ).pipe(
                map((event) => {
                    const {link, href} = this.resolveLinkHref(event.target as Element);

                    if (!link || !href) {
                        return false;
                    }

                    return href;
                }),
            ),
            merge(
                fromEvent(this.elementRef.nativeElement as HTMLElement, "mouseout"),
                this.bodyIframeEventSubject$.pipe(
                    filter(({type}) => type === "mouseout"),
                ),
            ).pipe(
                map(() => false),
            ),
        ).pipe(
            distinctUntilChanged(),
        );

        this.subscription.add(
            this.bodyIframeEventSubject$.pipe(
                filter(({type}) => type === "click"),
            ).subscribe((event) => {
                this.click(event);
            }),
        );

        this.subscription.add(
            this.ngChangesObservable("mailData").subscribe(({rootNode, rootNodeMail}) => {
                this.renderBody(rootNodeMail);
            }),
        );
    }

    ngAfterViewInit() {
        this.subscription.add(
            combineLatest(
                this.conversationCollapsed$.pipe(
                    distinctUntilChanged(),
                ),
                this.ngChangesObservable("mailData").pipe(
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

    selectRootNodeMail({pk}: Pick<Mail, "pk">) {
        this.selectRootNodeMailToDisplayHandler.emit(pk);
    }

    toggleConversationCollapsing() {
        this.conversationCollapsed$.next(!this.conversationCollapsed$.value);
    }

    ngOnDestroy() {
        super.ngOnDestroy();
        this.subscription.unsubscribe();
        this.bodyIframeEventSubject$.complete();
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
