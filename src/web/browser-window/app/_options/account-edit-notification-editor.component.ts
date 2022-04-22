import {ChangeDetectionStrategy, Component, Inject, Injector, Input} from "@angular/core";
import {distinctUntilChanged, filter, mergeMap, switchMap, take, takeUntil, withLatestFrom} from "rxjs/operators";
import {from, timer} from "rxjs";

import {AbstractMonacoEditorComponent} from "src/web/browser-window/app/components/abstract-monaco-editor.component";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {formatCodeLines} from "src/web/browser-window/app/store/util";
import {ONE_SECOND_MS} from "src/shared/const";
import {SPACER_PX} from "src/web/constants";

// TODO reference template/styles from external files (so can be shared with the class ancestor/successor)
@Component({
    selector: "electron-mail-account-edit-notification-editor",
    template: `
        <div class="progress mt-2" *ngIf="!editorInstance">
            <div class="progress-bar progress-bar-striped progress-bar-animated bg-secondary w-100">
                <span class="px-1">Code editor initializing ...</span>
            </div>
        </div>
        <div class="editor-block"></div>
    `,
    styles: [`
        :host {
            display: flex;
            flex-direction: column;
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountEditNotificationEditorComponent extends AbstractMonacoEditorComponent {
    @Input()
    editable = false;

    @Input()
    initialContent?: string;

    // TODO don't hardcode the component's selector
    readonly widthBySelector = "electron-mail-account-edit";

    // TODO turn the hardcoded code samples library into the user-editable list of snippets
    protected readonly codeSnippets = ([
        {
            value: `
                // hint: export some messages to JSON to see the data model structure
                formatNotificationContent(({login, alias, mails}) => [
                  login + (alias ? \` / \${alias}\` : "") + \` (\${mails.length}):\`,
                  ...mails.reduce(
                    (lines, {Subject, Sender, Time}) => [
                      ...lines,
                      \`[\${new Date(Time * 1000).toLocaleString()}] \` +
                      \`\${Sender.Name} <\${Sender.Address}>\\n\${Subject}\`,
                    ], []).reverse(),
                ].join("\\n\\n"));
            `,
        },
    ] as const).map(formatCodeLines);

    constructor(@Inject(Injector) injector: Injector) {
        super(injector, () => this.initialContent ?? (this.codeSnippets[0]?.value || ""));

        this.editable$ = this
            .ngChangesObservable("editable")
            .pipe(distinctUntilChanged());

        {
            const ipcMainClient = injector.get(ElectronService).ipcMainClient();
            const login$ = this.ngChangesObservable("login");
            const bootstrapFetchCompletePing$ = timer(0, ONE_SECOND_MS).pipe(
                switchMap(() => login$),
                switchMap((value) => from(ipcMainClient("dbGetAccountMetadata")({login: value}))),
                filter((value) => Boolean(value?.latestEventId)),
                withLatestFrom(login$),
            );
            this.folders$ = bootstrapFetchCompletePing$
                .pipe(
                    take(1),
                    switchMap(([, login]) => from(
                        ipcMainClient("dbGetAccountFoldersView")({login}),
                    )),
                    mergeMap((value) => value ? [[...value.folders.system, ...value.folders.custom]] : []),
                    takeUntil(this.ngOnDestroy$),
                );
        }
    }

    protected updateMonacoEditorWidthPostprocessing(value: number): number {
        return value - SPACER_PX * 5;
    }
}
