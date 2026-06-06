import {Directive, ElementRef, EventEmitter, inject, Injector, Input, NgZone, Output} from "@angular/core";
import {filter, take, takeUntil} from "rxjs/operators";
import {fromEvent, Observable, of, Subscription} from "rxjs";
import type {OnDestroy, OnInit} from "@angular/core";
import {select, Store} from "@ngrx/store";

import {AccountConfig} from "src/shared/model/account";
import {LABEL_TYPE, View} from "src/shared/model/database";
import {MONACO_EDITOR_LAZY_CHUNK_NAME} from "src/shared/const/webpack";
import {NgChangesObservableDirective} from "src/web/browser-window/app/components/ng-changes-observable.directive";
import {ONE_SECOND_MS} from "src/shared/const";
import {OptionsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/root";

type MonacoModule = typeof import("monaco-editor");

const resolveMonacoModule = async (): Promise<MonacoModule> => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    Object.keys(Object(MONACO_EDITOR_LAZY_CHUNK_NAME)); // preserve import from being tree-shaked as "webpackChunkName" needs it
    const monaco = await import(/* webpackChunkName: MONACO_EDITOR_LAZY_CHUNK_NAME */ "monaco-editor");
    return monaco;
};

// TODO load minimal monaco+typescript only, not the entire library
// const resolveMonacoModule = ((): () => Promise<MonacoModule> => {
//     let fn: () => Promise<MonacoModule> = async () => {
//         const monaco = await import(
//             /* webpackChunkName: MONACO_EDITOR_LAZY_CHUNK_NAME */ "monaco-editor/esm/vs/editor/editor.api"
//         );
//         const tsLanguage = await import(
//             /* webpackChunkName: MONACO_TS_LAZY_CHUNK_NAME */ "monaco-editor/esm/vs/basic-languages/typescript/typescript"
//         );
//         monaco.languages.register({id: "typescript"});
//         monaco.languages.setMonarchTokensProvider("typescript", tsLanguage.language);
//         monaco.languages.setLanguageConfiguration("typescript", tsLanguage.conf);
//         // TODO link "languages" to "monaco"
//         await import(
//             /* webpackChunkName: MONACO_TS_CONTRIB_LAZY_CHUNK_NAME */
//             "monaco-editor/esm/vs/language/typescript/monaco.contribution"
//         );
//         fn = async () => Promise.resolve(monaco);
//         return monaco;
//     };
//     return fn;
// })();

@Directive()
// so weird not single-purpose directive huh, https://github.com/angular/angular/issues/30080#issuecomment-539194668
// eslint-disable-next-line @angular-eslint/directive-class-suffix
export abstract class AbstractMonacoEditorDirective extends NgChangesObservableDirective implements OnInit, OnDestroy {
    protected readonly injector = inject(Injector);
    protected readonly store = inject<Store<State>>(Store);
    private readonly zone = inject(NgZone);
    private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

    @Input({required: true})
    login!: AccountConfig["login"];

    @Output()
    readonly content = new EventEmitter<{codeEditorContent?: string}>();

    folders$: Observable<Array<Pick<View.Folder, "id" | "unread" | "type" | "name">>> = of([]);

    editorInstance?: ReturnType<MonacoModule["editor"]["create"]>;

    protected editable$: Observable<boolean> = of(true);

    protected constructor(
        // eslint-disable-next-line @angular-eslint/prefer-inject
        private readonly resolveInitialValue: () => string,
    ) {
        super();
    }

    ngOnInit(): void {
        this.folders$
            .pipe(
                filter(({length}) => Boolean(length)),
                take(1),
                takeUntil(this.ngOnDestroy$),
            )
            .subscribe(async (items) => this.initializeEditor(items));

        // TODO drop "unhandledrejection" event handling when the following fix gets released:
        //      https://github.com/microsoft/vscode/commit/49cad9a1c0d9ef01d66eef60b261c7ebcffcef23
        fromEvent<PromiseRejectionEvent>(window, "unhandledrejection")
            .pipe(takeUntil(this.ngOnDestroy$))
            .subscribe((event) => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const {stack = "", name}: {stack?: string; name?: string} = event?.reason ?? {};
                if (
                    name === "Canceled"
                    && ["Delayer.cancel", "Function.onMouseLeave"].every((stackToInclude) => stack.includes(stackToInclude))
                ) {
                    event.preventDefault();
                }
            });

        this.store
            .pipe(
                select(OptionsSelectors.FEATURED.shouldUseDarkColors),
                takeUntil(this.ngOnDestroy$),
            )
            .subscribe(async (shouldUseDarkColors) => {
                const builtInTheme: Parameters<MonacoModule["editor"]["defineTheme"]>[1]["base"] = shouldUseDarkColors ? "vs-dark" : "vs";
                (await resolveMonacoModule()).editor.setTheme(builtInTheme);
            });
    }

    protected updateMonacoEditorWidthPostprocessing(value: number): number {
        return value;
    }

    protected abstract parentElSelectorForGettingWidth(): string;

    protected updateMonacoEditorWidth(): void {
        const {editorInstance} = this;

        if (!editorInstance) {
            return;
        }

        const widthBy = ((): number => {
            const stopSelector = this.parentElSelectorForGettingWidth();
            let iterationAllowed = 20;
            let el: HTMLElement | null = this.elementRef.nativeElement;
            while (el && iterationAllowed) {
                if (el.matches(stopSelector)) {
                    return el.offsetWidth;
                }
                iterationAllowed--;
                el = el.parentElement;
            }
            throw new Error(`Failed to locate the element by "${stopSelector}" selector!`);
        })();

        try {
            editorInstance.layout({
                width: this.updateMonacoEditorWidthPostprocessing(widthBy),
                height: editorInstance.getLayoutInfo().height,
            });
        } finally { // eslint-disable-next-line no-empty
        }
    }

    protected updateMonacoEditorHeight(): void {
        const {editorInstance} = this;

        if (!editorInstance) {
            return;
        }

        const maxHeight = 300;
        const {width} = editorInstance.getLayoutInfo();
        const contentHeight = Math.min(maxHeight, editorInstance.getContentHeight());

        Object.assign(
            editorInstance.getContainerDomNode().style,
            {width: `${width}px`, height: `${contentHeight}px`},
        );

        try {
            editorInstance.layout({width, height: contentHeight});
        } finally { // eslint-disable-next-line no-empty
        }
    }

    protected folderDtsCodeInclude(
        folders: Unpacked<typeof AbstractMonacoEditorDirective.prototype.folders$>,
        type: Unpacked<typeof LABEL_TYPE._.values>,
    ): string {
        return `
            { ${type === LABEL_TYPE.MESSAGE_FOLDER ? "Folders" : "Labels"}: Array<{
                Id: string, Unread: number, Size: number
                Name: ${folders.filter((folder) => folder.type === type).map(({name}) => JSON.stringify(name)).join(" | ")}
            }> }
        `;
    }

    protected subscribeToEditorDisposing(): Subscription {
        return fromEvent(window, "resize").pipe(
            takeUntil(this.ngOnDestroy$),
        ).subscribe(() => {
            this.updateMonacoEditorWidth();
            this.updateMonacoEditorHeight();
        });
    }

    private initializeEditorFunctionMailDts(
        folders: Unpacked<typeof AbstractMonacoEditorDirective.prototype.folders$>,
        extraMailPropsDts = "",
    ): string {
        return `
            DeepReadonly<
                Omit<import("lib/interfaces/mail/Message").Message, "Body">
                &
                { Body: string, EncryptedBody: string, _BodyDecryptionFailed?: boolean ${extraMailPropsDts} }
                &
                ${this.folderDtsCodeInclude(folders, LABEL_TYPE.MESSAGE_FOLDER)}
                &
                ${this.folderDtsCodeInclude(folders, LABEL_TYPE.MESSAGE_LABEL)}
            >
        `;
    }

    // TODO turn to "abstract protected" method and apply it per editor instance
    //      see the respective issue/blocker: https://github.com/microsoft/monaco-editor/issues/2098
    private initializeEditorFunctionDts(folders: Unpacked<typeof AbstractMonacoEditorDirective.prototype.folders$>): string {
        return [
            `
            declare const filterMessage = (
                fn: (mail: ${this.initializeEditorFunctionMailDts(folders)}) => boolean,
            ) => void;`,
            `
            declare const formatNotificationContent = (
                fn: (
                    arg: {
                        login: string,
                        alias?: string,
                        mails: Array<${this.initializeEditorFunctionMailDts(folders, ", BodyText: string ")}>,
                    },
                ) => string,
            ) => void;`,
            `
            declare const formatNotificationShellExecArguments = (
                fn: (
                    arg: {
                        login: string,
                        alias?: string,
                        mails: Array<${this.initializeEditorFunctionMailDts(folders, ", BodyText: string ")}>,
                        process: { env: Record<string, string> },
                    },
                ) => { command: string, options?: { cwd?: string, env?: Record<string, string> } },
            ) => void;`,
        ].join("");
    }

    private async initializeEditor(folders: Unpacked<typeof AbstractMonacoEditorDirective.prototype.folders$>): Promise<void> {
        const {typescript} = await resolveMonacoModule();

        typescript.typescriptDefaults.setCompilerOptions({
            allowNonTsExtensions: true,
            target: typescript.ScriptTarget.ESNext,
        });

        typescript.typescriptDefaults.setExtraLibs(
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
                        ${this.initializeEditorFunctionDts(folders)}
                        `;
                    })()
                    : "";
                const [content /*, filePath*/] = __METADATA__.monacoEditorExtraLibArgs[key];
                return {content: content + footerContent, filePath: `${key}.d.ts`};
            }),
        );

        await this.zone.runOutsideAngular(async () => {
            await this.initializeEditorInstance();
        });
    }

    private async initializeEditorInstance(): Promise<void> {
        const {editor, Selection} = await resolveMonacoModule();

        this.editorInstance = editor.create(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            this.elementRef.nativeElement.querySelector(".editor-block") as HTMLElement,
            {
                value: this.resolveInitialValue(),
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

        this.editable$
            .pipe(takeUntil(this.ngOnDestroy$))
            .subscribe((editable) => this.editorInstance?.updateOptions({readOnly: !editable}));

        // tweak layout: width
        this.editorInstance.dispose = ((originalMonacoEditorDisposeFn, editorDisposingSubscription) => () => {
            editorDisposingSubscription.unsubscribe();
            originalMonacoEditorDisposeFn();
        })(this.editorInstance.dispose.bind(this.editorInstance), this.subscribeToEditorDisposing());
        this.updateMonacoEditorWidth();

        // tweak layout: height
        this.editorInstance.onDidContentSizeChange(this.updateMonacoEditorHeight.bind(this));
        this.updateMonacoEditorHeight();

        this.editorInstance.onDidChangeModelContent(this.propagateEditorContent.bind(this));
        this.propagateEditorContent();

        setTimeout(() => {
            this.editorInstance?.setSelection(new Selection(1, 2, 1, 2));
            this.editorInstance?.focus();
        }, ONE_SECOND_MS / 4);
    }

    private propagateEditorContent(): void {
        this.content.emit({codeEditorContent: this.editorInstance?.getValue()});
    }

    ngOnDestroy(): void {
        this.editorInstance?.dispose();
        delete this.editorInstance;
    }
}
