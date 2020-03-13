import {Deferred} from "ts-deferred";
import {Observable, Subscription} from "rxjs";

import {HOVERED_HREF_HIGHLIGHT_TAG_NAME, ONE_SECOND_MS} from "src/shared/constants";
import {IPC_MAIN_API, IPC_MAIN_API_NOTIFICATION_ACTIONS, IpcMainServiceScan} from "src/shared/api/main";
import {buildLoggerBundle} from "src/electron-preload/lib/util";

// TODO TS add declaration for "index.scss" and use "ES import" then
// tslint:disable-next-line:no-var-requires
const css = require(`to-string-loader!css-loader!sass-loader!./index.scss`);
// tslint:disable-next-line:no-var-requires
const {locals: {renderVisibleClass}}: { locals: { renderVisibleClass: string } } = require(`css-loader!sass-loader!./index.scss`);

export class HoveredHrefHighlightElement extends HTMLElement {
    public static readonly tagName = HOVERED_HREF_HIGHLIGHT_TAG_NAME;

    private readonly logger = {...buildLoggerBundle(`[${HoveredHrefHighlightElement.tagName}]`)} as const;

    // TODO share single "notification$" instance between all the element instances, so make it static field?
    private notification$?: Observable<IpcMainServiceScan["ApiImplReturns"]["notification"]>;

    private readonly root: ShadowRoot;

    private readonly renderEl: HTMLDivElement;

    private readonly subscription = new Subscription();

    private readonly releaseApiClientDeferred = new Deferred<void>();

    private readonly beforeUnloadEventHandlingArgs: readonly ["beforeunload", () => void] = [
        "beforeunload",
        () => this.destroy(),
    ];
    private readonly mouseLeaveEventHandlingArgs: readonly ["mouseleave", () => void] = [
        "mouseleave",
        () => {
            this.renderEl.classList.remove(renderVisibleClass);
        },
    ];

    constructor() {
        super();
        this.logger.info("constructor()");
        this.root = this.attachShadow({mode: "closed"});
        this.root.innerHTML = `<style>${css}</style>`;
        this.renderEl = this.root.appendChild(document.createElement("div"));
        this.renderEl.addEventListener(...this.mouseLeaveEventHandlingArgs);
        window.addEventListener(...this.beforeUnloadEventHandlingArgs);
    }

    destroy() {
        this.logger.info("destroy()");
        this.releaseApiClientDeferred.resolve();
        this.subscription.unsubscribe();
        this.renderEl.removeEventListener(...this.mouseLeaveEventHandlingArgs);
        window.removeEventListener(...this.beforeUnloadEventHandlingArgs);
        this.root.innerHTML = "";
        delete this.notification$;
    }

    connectedCallback() {
        this.logger.info("connectedCallback()");

        this.subscription.add(
            this.resolveNotification().subscribe(
                (value) => {
                    if (!IPC_MAIN_API_NOTIFICATION_ACTIONS.is.TargetUrl(value) || !value.payload.url) {
                        this.renderEl.classList.remove(renderVisibleClass);
                        return;
                    }
                    this.renderEl.innerText = value.payload.url;
                    this.renderEl.classList.add(renderVisibleClass);
                },
                this.logger.error,
            ),
        );
    }

    disconnectedCallback() {
        this.logger.info("disconnectedCallback()");
        this.subscription.unsubscribe();
    }

    private resolveNotification() {
        if (this.notification$) {
            return this.notification$;
        }

        const apiClient = IPC_MAIN_API.client({options: {logger: this.logger}});

        return this.notification$ = apiClient(
            "notification",
            {
                finishPromise: this.releaseApiClientDeferred.promise,
                timeoutMs: ONE_SECOND_MS * 3,
            },
        )();
    }
}

export function registerHoveredHrefHighlightElement(
    name = HoveredHrefHighlightElement.tagName,
): {
    tagName: string;
} {
    customElements.define(name, HoveredHrefHighlightElement);

    console.log(`"${name}" custom element has been registered`); // tslint:disable-line:no-console

    return {
        tagName: name,
    };
}

export function attachHoveredHrefHighlightElement(): HoveredHrefHighlightElement {
    const el = document.createElement(registerHoveredHrefHighlightElement().tagName) as HoveredHrefHighlightElement;

    document.addEventListener("DOMContentLoaded", () => {
        document.body.appendChild(el);
    });

    return el;
}
