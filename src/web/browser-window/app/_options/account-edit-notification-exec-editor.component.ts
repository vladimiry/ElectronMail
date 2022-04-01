import {ChangeDetectionStrategy, Component} from "@angular/core";

import {AccountEditNotificationEditorComponent} from "./account-edit-notification-editor.component";
import {formatCodeLines} from "src/web/browser-window/app/store/util";

// TODO reference template/styles from external files (so can be shared with the class ancestor/successor)
@Component({
    selector: "electron-mail-account-edit-notification-exec-editor",
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
export class AccountEditNotificationExecEditorComponent extends AccountEditNotificationEditorComponent {
    // TODO turn the hardcoded code samples library into the user-editable list of snippets
    protected readonly codeSnippets = ([
        {
            value: `
                // hint: export some messages to JSON to see the data model structure
                formatNotificationShellExecArguments(({login, alias, mails}) => {
                  const data = JSON.stringify({
                    login, alias,
                    mails: mails.reduce((accumulator, {Subject, Sender, Time}) => {
                      return [...accumulator, {Sender, Subject, Time: Time * 1000}];
                    }, []),
                  });
                  return {
                    command: \`node /home/usr/em-logger.js \${JSON.stringify(data)}\`,
                    options: {cwd: "/home/usr/docs", env: {SOME_ENV: "SomeValue"}},
                  };
                });
            `,
        },
    ] as const).map(formatCodeLines);
}
