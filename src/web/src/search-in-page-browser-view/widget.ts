import {Subscription, from, fromEvent} from "rxjs";
import {debounceTime, filter, switchMap} from "rxjs/operators";

import {IPC_MAIN_API} from "src/shared/api/main";
import {ONE_SECOND_MS} from "src/shared/constants";

export class SearchInPageWidget {
    private readonly apiClient = IPC_MAIN_API.buildClient({
        ipcRenderer: __ELECTRON_EXPOSURE__.ipcRendererTransport,
        options: {timeoutMs: ONE_SECOND_MS},
    });
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
    private readonly subscription = new Subscription();

    private requestId?: number;
    private activeIdx?: number;
    private maxIdx?: number;
    private query?: string;

    constructor({els}: { els: typeof SearchInPageWidget.prototype.els }) {
        this.els = els;
        this.initEvents();
        this.initFoundNotification();
    }

    open() {
        this.syncElements();
        setTimeout(() => this.els.input.focus());
    }

    async close() {
        await this.stopFind();
        await this.destroy();
        await this.apiMethods.findInPageDisplay({visible: false}).toPromise();
    }

    async destroy() {
        this.subscription.unsubscribe();
        await this.stopFind();
    }

    protected async onQuery(forward: boolean, continueRequested: boolean = true) {
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
    }

    protected initEvents() {
        this.subscription.add(
            fromEvent<KeyboardEvent>(this.els.input, "keydown")
                .pipe(
                    debounceTime(150),
                    // tslint:disable-next-line ban
                    switchMap(({shiftKey, code}) => from(this.onQuery(!shiftKey, ["Enter", "NumpadEnter"].includes(code)))),
                )
                .subscribe(async () => {
                    // setTimeout(() => this.els.input.focus());
                }),
        );

        this.subscription.add(
            fromEvent(this.els.findPrev, "click").subscribe(async () => {
                await this.onQuery(false);
            }),
        );

        this.subscription.add(
            fromEvent(this.els.findNext, "click").subscribe(async () => {
                await this.onQuery(true);
            }),
        );

        this.subscription.add(
            fromEvent(this.els.close, "click").subscribe(async () => {
                await this.close();
            }),
        );

        this.subscription.add(
            fromEvent<KeyboardEvent>(this.els.root, "keydown")
                .pipe(
                    filter((event) => event.key === "Escape" || event.key === "Esc"),
                )
                .subscribe(async () => {
                    await this.close();
                }),
        );
    }

    protected initFoundNotification() {
        this.subscription.add(
            this.apiMethods.findInPageNotification({}).subscribe((result) => {
                if (!result.requestId || result.requestId !== this.requestId) {
                    return;
                }

                this.activeIdx = result.activeMatchOrdinal;
                this.maxIdx = result.matches;

                this.syncElements();
            }),
        );
    }

    protected isSearching() {
        return (
            this.requestId !== null
            &&
            typeof this.query === "string"
        );
    }

    protected async startFind(query: string) {
        const result = await this
            .apiMethods
            .findInPage({query})
            .toPromise();
        this.requestId = result.requestId;
        this.query = query;
        delete this.activeIdx;
        delete this.maxIdx;
    }

    protected async continueFind(options: Electron.FindInPageOptions) {
        if (!this.isSearching()) {
            throw new Error(`Search has not been started yet`);
        }
        const result = await this
            .apiMethods
            .findInPage({query: this.query || "", options})
            .toPromise();
        this.requestId = result.requestId;
    }

    protected async stopFind() {
        this.els.input.value = "";

        delete this.requestId;
        delete this.query;
        delete this.activeIdx;
        delete this.maxIdx;

        this.syncElements();

        await this.apiMethods.findInPageStop({action: "clearSelection"}).toPromise();
    }

    protected syncElements() {
        const disabledButtons = typeof this.maxIdx !== "number" || this.maxIdx < 2;

        this.els.findPrev.disabled = disabledButtons;
        this.els.findNext.disabled = disabledButtons;

        this.els.status.innerText = this.query
            ? `${this.activeIdx}/${this.maxIdx}`
            : "";
        this.els.status.classList[this.query ? "remove" : "add"]("d-none");
    }
}
