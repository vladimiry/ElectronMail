import {ChangeDetectionStrategy, Component, ElementRef, EventEmitter, NgZone, OnInit, Output} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {debounceTime, distinctUntilChanged, filter, map, pairwise, takeUntil, withLatestFrom,} from "rxjs/operators";
import {fromEvent, merge} from "rxjs";
import {noop} from "remeda";

import * as monaco from "monaco-editor";
import {DbViewAbstractComponent} from "src/web/browser-window/app/_db-view/db-view-abstract.component";
import {LABEL_TYPE, View} from "src/shared/model/database";
import {ONE_SECOND_MS} from "src/shared/constants";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/db-view";

// TODO turn the hardcoded code samples library into the user-editable list of snippets
const codeSnippets = ([
    {
        title: "Filter by body content",
        value: `
                // try to export some messages to JSON to see the data model structure
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
                        .entries(ParsedHeaders)
                        .some(([name, value]) => name.toLowerCase() === "content-type" && value === "text/plain")
                })
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
] as const).map(({title, value}) => {
    // TODO remove temporary code that remove starting spaces from the snippets
    const lines = value.split("\n").filter((line) => Boolean(line.trim()));
    const skipCharsFromStart = lines.reduce((value, line) => Math.min(line.length - line.trimLeft().length, value), Number.MAX_VALUE);
    return {title, value: lines.map((line) => line.substr(skipCharsFromStart)).join("\n"), disabled: true};
});

@Component({
    selector: "electron-mail-db-view-monaco-editor",
    templateUrl: "./db-view-monaco-editor.component.html",
    styleUrls: ["./db-view-monaco-editor.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMonacoEditorComponent extends DbViewAbstractComponent implements OnInit {
    @Output()
    readonly content = new EventEmitter<{ codeEditorContent?: string }>();

    readonly folders$ = this.instance$.pipe(
        map((value) => [...value.folders.system, ...value.folders.custom]),
    );

    readonly selectedMail$ = this.instance$.pipe(
        map((value) => value.selectedMail),
        distinctUntilChanged((prev, curr) => curr?.listMailPk === prev?.listMailPk),
    );

    readonly codeSnippets = codeSnippets;

    editorInstance?: ReturnType<typeof monaco.editor.create>;

    constructor(
        readonly store: Store<State>,
        private readonly zone: NgZone,
        private readonly elementRef: ElementRef<HTMLElement>,
    ) {
        super(store);
    }

    ngOnInit(): void {
        this.folders$
            .pipe(takeUntil(this.ngOnDestroy$))
            .subscribe((folders) => this.initializeEditor(folders));

        this.selectedMail$
            .pipe(
                pairwise(),
                filter(([prev, curr]) => Boolean(prev) !== Boolean(curr)),
                takeUntil(this.ngOnDestroy$),
            )
            .subscribe(() => {
                // TODO implement proper "monaco editor" area layouting (dynamic "width" at least)
                this.editorInstance?.layout();
            });

        // TODO drop "unhandledrejection" event handling when the following fix gets released:
        //      https://github.com/microsoft/vscode/commit/49cad9a1c0d9ef01d66eef60b261c7ebcffcef23
        fromEvent<PromiseRejectionEvent>(window, "unhandledrejection")
            .pipe(takeUntil(this.ngOnDestroy$))
            .subscribe((event) => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const {stack = "", name}: { stack?: string, name?: string } = event?.reason ?? {};
                if (
                    name === "Canceled"
                    &&
                    ["Delayer.cancel", "Function.onMouseLeave"].every((stackToInclude) => stack.includes(stackToInclude))) {
                    event.preventDefault();
                }
            });

        this.store
            .pipe(
                select(OptionsSelectors.FEATURED.shouldUseDarkColors),
                takeUntil(this.ngOnDestroy$),
            )
            .subscribe((shouldUseDarkColors) => {
                const builtInTheme: Parameters<typeof monaco.editor.defineTheme>[1]["base"] = shouldUseDarkColors ? "vs-dark" : "vs";
                monaco.editor.setTheme(builtInTheme);
            });

        this.ngOnDestroy$.subscribe(() => {
            this.editorInstance?.dispose();
            delete this.editorInstance;
        });
    }

    private updateMonacoEditorWidth(
        selectedMail: Unpacked<typeof DbViewMonacoEditorComponent.prototype.selectedMail$>,
    ): void {
        const editor = this.editorInstance;

        if (!editor) {
            return;
        }

        // TODO remove 8px use from the code logic (outer h-padding: 8px in CSS)
        const componentHorizontalPadding = 8;
        const widthDelimiter = 1 + Number(Boolean(selectedMail));
        // TODO don't calculate sizing based on window size but parent component size
        // TODO improve width calculation if window width value is lower than "map-get($grid-breakpoints, lg) / 1200px" value
        const windowBasedWidth = window.innerWidth / widthDelimiter - componentHorizontalPadding * 2;

        try {
            editor.layout({
                width: windowBasedWidth + ((widthDelimiter - 1) * 2),
                height: editor.getLayoutInfo().height,
            });
        } finally {} // eslint-disable-line no-empty

        this.updateMonacoEditorHeight();
    }

    private updateMonacoEditorHeight(): void {
        const editor = this.editorInstance;

        if (!editor) {
            return;
        }

        const maxHeight = 300;
        const {width} = editor.getLayoutInfo();
        const contentHeight = Math.min(maxHeight, editor.getContentHeight());

        Object.assign(
            editor.getContainerDomNode().style,
            {width: `${width}px`, height: `${contentHeight}px`},
        );

        try {
            editor.layout({width, height: contentHeight});
        } finally {} // eslint-disable-line no-empty
    }

    private initializeEditor(folders: DeepReadonly<View.Folder[]>): void {
        const folderDtsCodeInclude = (type: Unpacked<typeof LABEL_TYPE._.values>): string => `
            { ${type === LABEL_TYPE.MESSAGE_FOLDER ? "Folders" : "Labels"}: Array<{
                Id: string, Unread: number, Size: number
                Name: ${folders.filter((folder) => folder.type === type).map(({name}) => JSON.stringify(name)).join(" | ")}
            }> }
        `;

        monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            allowNonTsExtensions: true,
            target: monaco.languages.typescript.ScriptTarget.ESNext,
        });

        monaco.languages.typescript.typescriptDefaults.setExtraLibs(
            (["system", "protonMessage"] as const).map((key) => {
                const footerContent = key === "protonMessage"
                    ? (() => {
                        return `
                        type Primitive = string | number | boolean | bigint | symbol | undefined | null;
                        type Builtin = Primitive | Function | Date | Error | RegExp;
                        type DeepReadonly<T> = T extends Builtin
                            ? T
                            : T extends Map<infer K, infer V>
                                ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
                                : T extends ReadonlyMap<infer K, infer V>
                                    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
                                    : T extends WeakMap<infer K, infer V>
                                        ? WeakMap<DeepReadonly<K>, DeepReadonly<V>>
                                        : T extends Set<infer U>
                                            ? ReadonlySet<DeepReadonly<U>>
                                            : T extends ReadonlySet<infer U>
                                                ? ReadonlySet<DeepReadonly<U>>
                                                : T extends WeakSet<infer U>
                                                    ? WeakSet<DeepReadonly<U>>
                                                    : T extends Promise<infer U>
                                                        ? Promise<DeepReadonly<U>>
                                                        : T extends {}
                                                            ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
                                                            : Readonly<T>;
                        declare const filterMessage = (
                            filter: (
                                mail: DeepReadonly<
                                    Omit<import("lib/interfaces/mail/Message").Message, "Body">
                                    &
                                    { Body: string, EncryptedBody: string, _BodyDecryptionFailed?: boolean }
                                    &
                                    ${folderDtsCodeInclude(LABEL_TYPE.MESSAGE_FOLDER)}
                                    &
                                    ${folderDtsCodeInclude(LABEL_TYPE.MESSAGE_LABEL)}
                                >
                            ) => boolean,
                        ) => void;
                        `;
                    })()
                    : "";
                const [content, filePath] = __METADATA__.monacoEditorExtraLibArgs[key];

                return {content: content + footerContent, filePath};
            }),
        );

        this.zone.runOutsideAngular(this.initializeEditorInstance.bind(this));
    }

    private initializeEditorInstance(): void {
        // making sure function called once
        this.initializeEditorInstance = noop;

        this.editorInstance = monaco.editor.create(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            this.elementRef.nativeElement.querySelector(".editor-block") as HTMLElement,
            {
                value: this.codeSnippets[0]?.value,
                language: "typescript",
                codeLens: false,
                contextmenu: false,
                dragAndDrop: false,
                folding: false,
                glyphMargin: false,
                lineDecorationsWidth: 5,
                lineNumbers: "off",
                lineNumbersMinChars: 0,
                minimap: {enabled: false},
                overviewRulerLanes: 0,
                padding: {top: 5, bottom: 5},
                scrollbar: {horizontal: "auto", vertical: "auto"},
                scrollBeyondLastLine: false,
                // automaticLayout: true, // doesn't work well enough
            },
        );

        // tweak layout: width
        this.editorInstance.dispose = ((originalMmonacoEditorDisposeFn, updateMonacoEditorWidthSubscription) => {
            return () => {
                updateMonacoEditorWidthSubscription.unsubscribe();
                originalMmonacoEditorDisposeFn();
            };
        })(
            this.editorInstance.dispose.bind(this.editorInstance),
            merge(
                fromEvent(window, "resize").pipe(
                    debounceTime(ONE_SECOND_MS / 5),
                ).pipe(
                    withLatestFrom(this.selectedMail$),
                    map(([, selectedMail]) => selectedMail),
                ),
                this.selectedMail$,
            ).pipe(
                takeUntil(this.ngOnDestroy$),
            ).subscribe(this.updateMonacoEditorWidth.bind(this)),
        );

        // tweak layout: height
        this.editorInstance.onDidContentSizeChange(this.updateMonacoEditorHeight.bind(this));
        this.updateMonacoEditorHeight();

        this.editorInstance.onDidChangeModelContent(this.propagateEditorContent.bind(this));
        this.propagateEditorContent();

        setTimeout(() => {
            this.editorInstance?.setSelection(new monaco.Selection(1, 2, 1, 2));
            this.editorInstance?.focus();
        }, ONE_SECOND_MS / 4);
    }

    private propagateEditorContent(): void {
        this.content.emit({codeEditorContent: this.editorInstance?.getValue()});
    }
}
