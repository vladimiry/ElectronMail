import asap from "asap-es";
import {debounceTime, filter, switchMap} from "rxjs/operators";
import {from, fromEvent, Subscription} from "rxjs";

import {ONE_SECOND_MS} from "src/shared/const";

export class SearchInPageWidget {
    private readonly apiClient = __ELECTRON_EXPOSURE__.buildIpcMainClient({options: {timeoutMs: ONE_SECOND_MS}});
    private readonly apiMethods = {
        findInPage: this.apiClient("findInPage"),
        findInPageStop: this.apiClient("findInPageStop"),
        findInPageDisplay: this.apiClient("findInPageDisplay"),
        findInPageNotification: this.apiClient("findInPageNotification"),
    };
    private readonly els: {
        readonly root: HTMLElement;
        readonly input: HTMLInputElement;
        readonly status: HTMLElement;
        readonly findPrev: HTMLButtonElement;
        readonly findNext: HTMLButtonElement;
        readonly close: HTMLButtonElement;
    };
    private readonly queryQueue = new asap();
    private readonly subscription = new Subscription();

    private requestId?: number;
    private activeIdx?: number;
    private maxIdx?: number;
    private query?: string;

    constructor({els}: {els: typeof SearchInPageWidget.prototype.els}) {
        this.els = els;
        this.initEvents();
        this.initFoundNotification();
    }

    open(): void {
        this.syncElements();
        setTimeout(() => this.els.input.focus());
    }

    async close(): Promise<void> {
        await this.stopFind();
        await this.destroy();
        await this.apiMethods.findInPageDisplay({visible: false});
    }

    async destroy(): Promise<void> {
        this.subscription.unsubscribe();
        await this.stopFind();
    }

    protected async find(forward: boolean, continueRequested = true): Promise<void> {
        return this.queryQueue.q(async () => {
            const {value: query} = this.els.input;
            const isSearchingWithSameQuery = this.isSearching() && query === this.query;

            if (isSearchingWithSameQuery) {
                if (continueRequested) {
                    await this.continueFind({forward});
                }
            } else if (query) {
                await this.startFind(query);
            } else {
                await this.stopFind();
            }
        });
    }

    protected initEvents(): void {
        this.subscription.add(
            fromEvent<KeyboardEvent>(this.els.input, "keydown").pipe(
                debounceTime(150),
                // tslint:disable-next-line ban
                switchMap(({shiftKey, code}) => from(this.find(!shiftKey, ["Enter", "NumpadEnter"].includes(code)))),
            ).subscribe(async () => {
                // setTimeout(() => this.els.input.focus());
            }),
        );

        this.subscription.add(
            fromEvent(this.els.findPrev, "click").subscribe(async () => {
                await this.find(false);
            }),
        );

        this.subscription.add(
            fromEvent(this.els.findNext, "click").subscribe(async () => {
                await this.find(true);
            }),
        );

        this.subscription.add(
            fromEvent(this.els.close, "click").subscribe(async () => {
                await this.close();
            }),
        );

        this.subscription.add(
            fromEvent<KeyboardEvent>(this.els.root, "keydown").pipe(filter((event) => event.key === "Escape" || event.key === "Esc"))
                .subscribe(async () => {
                    await this.close();
                }),
        );
    }

    protected initFoundNotification(): void {
        this.subscription.add(
            this.apiMethods.findInPageNotification().subscribe((result) => {
                if (!result.requestId || result.requestId !== this.requestId) {
                    return;
                }

                this.activeIdx = result.activeMatchOrdinal;
                this.maxIdx = result.matches;

                this.syncElements();
            }),
        );
    }

    protected isSearching(): boolean {
        return (this.requestId !== null
            && typeof this.query === "string");
    }

    protected async startFind(query: string): Promise<void> {
        const result = await this.apiMethods.findInPage({query});

        if (!result) {
            return this.close();
        }

        this.requestId = result.requestId;
        this.query = query;

        delete this.activeIdx;
        delete this.maxIdx;
    }

    protected async continueFind(options: Electron.FindInPageOptions): Promise<void> {
        if (!this.isSearching()) {
            throw new Error(`Search has not been started yet`);
        }

        const result = await this.apiMethods.findInPage({query: this.query || "", options});

        if (!result) {
            return this.close();
        }

        this.requestId = result.requestId;
    }

    protected async stopFind(): Promise<void> {
        this.els.input.value = "";

        delete this.requestId;
        delete this.query;
        delete this.activeIdx;
        delete this.maxIdx;

        this.syncElements();

        await this.apiMethods.findInPageStop();
    }

    protected syncElements(): void {
        const disabledButtons = typeof this.maxIdx !== "number" || this.maxIdx < 2;
        const {els} = this;

        els.findPrev.disabled = disabledButtons;
        els.findNext.disabled = disabledButtons;

        els.status.classList[this.query ? "remove" : "add"]("d-none");
        els.status.innerText = this.query ? `${String(this.activeIdx)}/${String(this.maxIdx)}` : "";
    }
}
