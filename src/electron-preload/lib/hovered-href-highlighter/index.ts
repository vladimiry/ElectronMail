import {Deferred} from "ts-deferred";
import {Subscription} from "rxjs";
import {subscribableLikeToObservable} from "electron-rpc-api";

import {IPC_MAIN_API, IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {ONE_SECOND_MS, PACKAGE_NAME} from "src/shared/constants";
import {buildLoggerBundle} from "src/electron-preload/lib/util";

// TODO TS add declaration for "index.scss" and use "ES import" then
// tslint:disable-next-line:no-var-requires
const css = require(`to-string-loader!css-loader!sass-loader!./index.scss`);
// tslint:disable-next-line:no-var-requires
const {locals: {renderVisibleClass}}: { locals: { renderVisibleClass: string } } = require(`css-loader!sass-loader!./index.scss`);

export class HoveredHrefHighlightElement extends HTMLElement {
    public static readonly tagName = `${PACKAGE_NAME}-hovered-href-highlight`.toLowerCase();

    private readonly logger = {...buildLoggerBundle(`[${HoveredHrefHighlightElement.tagName}]`)} as const;

    private readonly root: ShadowRoot;

    private readonly renderEl: HTMLDivElement;

    private readonly subscription = new Subscription();

    private readonly releaseApiClientDeferred = new Deferred<void>();

    private readonly beforeUnloadEventHandlingArgs: readonly ["beforeunload", () => void] = [
        "beforeunload",
        () => this.destroy(),
    ];

    constructor() {
        super();
        this.logger.info("constructor()");
        this.root = this.attachShadow({mode: "closed"});
        this.root.innerHTML = `<style>${css}</style>`;
        this.renderEl = this.root.appendChild(document.createElement("div"));
        window.addEventListener(...this.beforeUnloadEventHandlingArgs);
    }

    destroy() {
        this.logger.info("destroy()");
        this.releaseApiClientDeferred.resolve();
        this.subscription.unsubscribe();
        window.removeEventListener(...this.beforeUnloadEventHandlingArgs);
        this.root.innerHTML = "";
    }

    connectedCallback() {
        this.logger.info("connectedCallback()");

        this.subscription.add(
            subscribableLikeToObservable(this.resolveNotification()).subscribe(
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
        const apiClient = IPC_MAIN_API.client({options: {logger: this.logger}});

        return apiClient(
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
    const stylePatch: Partial<CSSStyleDeclaration> = {
        position: "fixed",
        bottom: "0",
        left: "0",
        zIndex: "10000",
    };

    Object.assign(el.style, stylePatch);

    document.addEventListener("DOMContentLoaded", () => {
        document.body.appendChild(el);
    });

    return el;
}
