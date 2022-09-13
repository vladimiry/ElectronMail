import {ChangeDetectionStrategy, Component, Inject, Injector} from "@angular/core";
import {debounceTime, distinctUntilChanged, filter, map, pairwise, takeUntil, withLatestFrom} from "rxjs/operators";
import {fromEvent, merge, Subscription} from "rxjs";
import type {OnInit} from "@angular/core";

import {AbstractMonacoEditorComponent} from "src/web/browser-window/app/components/abstract-monaco-editor.component";
import {formatCodeLines} from "src/web/browser-window/app/store/util";
import {ONE_SECOND_MS} from "src/shared/const";
import {resolveInstance$} from "./util";
import {SPACER_PX} from "src/web/constants";

// TODO turn the hardcoded code samples library into the user-editable list of snippets
const codeSnippets = ([
    {
        title: "Filter by body content",
        value: `
                // hint: export some messages to JSON to see the data model structure
                filterMessage((mail) => {
                    return mail.Body.toLowerCase().includes("thank you")
                })
            `,
    },
    {
        title: "Filter by header value",
        value: `
                filterMessage(({ParsedHeaders}) => {
                    return Object
                        .entries(ParsedHeaders || {})
                        .some(([name, value]) => name.toLowerCase() === "content-type" && value === "text/plain")
                })
            `,
    },
    {
        title: "Filter by date (older than 90 days)",
        value: `
                const msInOneSecond = 1000;
                const msInOneDay = 60 * 60  * 24 * msInOneSecond;
                const msLimit = Date.now() - msInOneDay * 90;
                filterMessage((mail) => mail.Time * msInOneSecond < msLimit);
            `,
    },
    {
        title: "Filter by sender domain and attachment size",
        value: `
                const twoMegabytes = 1024 * 1204 * 2;
                const domains = ["@protonmail.com", "@protonmail.zendesk.com"]
                filterMessage((mail) => (
                    domains.some((domain) => mail.Sender.Address.endsWith(domain))
                    && // and
                    mail.Attachments.some(({Size}) => Size > twoMegabytes)
                ))
            `,
    },
] as const).map(formatCodeLines);

@Component({
    selector: "electron-mail-db-view-monaco-editor",
    templateUrl: "./db-view-monaco-editor.component.html",
    styleUrls: ["./db-view-monaco-editor.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMonacoEditorComponent extends AbstractMonacoEditorComponent implements OnInit {
    readonly instance$ = resolveInstance$(this.store, this.ngChangesObservable("login"));

    readonly folders$ = this.instance$.pipe(
        map((value) => [...value.folders.system, ...value.folders.custom]),
    );

    readonly selectedMail$ = this.instance$.pipe(
        map((value) => value.selectedMail),
        distinctUntilChanged((prev, curr) => curr?.listMailPk === prev?.listMailPk),
    );

    readonly codeSnippets = codeSnippets;

    private selectedMail = false;

    constructor(@Inject(Injector) injector: Injector) {
        super(injector, () => this.codeSnippets[0]?.value ?? "");
    }

    protected parentElSelectorForGettingWidth(): string {
        // TODO don't hardcode the component's tag name but resolve it from selector "meta" information
        return "electron-mail-db-view-entry";
    }

    ngOnInit(): void {
        super.ngOnInit();

        this.selectedMail$
            .pipe(
                pairwise(),
                filter(([prev, curr]) => Boolean(prev) !== Boolean(curr)),
                takeUntil(this.ngOnDestroy$),
            )
            .subscribe(([, selectedMail]) => {
                this.selectedMail = Boolean(selectedMail);
                // TODO implement proper "monaco editor" area layouting (dynamic "width" at least)
                this.editorInstance?.layout();
            });
    }

    protected updateMonacoEditorWidthPostprocessing(value: number): number {
        const multiplier = Number(this.selectedMail) + 1;
        return value / multiplier - (SPACER_PX * (multiplier == 2 ? 0 : 2));
    }

    protected subscribeToEditorDisposing(): Subscription {
        return merge(
            fromEvent(window, "resize").pipe(
                withLatestFrom(this.selectedMail$),
                map(([, selectedMail]) => selectedMail),
            ),
            this.selectedMail$,
        ).pipe(
            debounceTime(ONE_SECOND_MS / 6),
            takeUntil(this.ngOnDestroy$),
        ).subscribe(() => {
            this.updateMonacoEditorWidth();
            this.updateMonacoEditorHeight();
        });
    }
}
