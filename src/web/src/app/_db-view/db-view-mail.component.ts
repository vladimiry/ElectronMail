import {ChangeDetectionStrategy, Component, HostBinding, Input} from "@angular/core";

import {MAIL_STATE, MailAddress, View} from "src/shared/model/database";

@Component({
    selector: "email-securely-app-db-view-mail",
    templateUrl: "./db-view-mail.component.html",
    styleUrls: ["./db-view-mail.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailComponent {
    state: Partial<Record<keyof typeof MAIL_STATE._.nameValueMap, boolean>> = {};
    stateTitle?: string;
    mailAddress!: MailAddress;
    mailAddressTotal!: number;

    private _mail!: View.Mail;

    get mail(): View.Mail {
        return this._mail;
    }

    @Input()
    set mail(mail: View.Mail) {
        this._mail = mail;

        this.state.DRAFT = mail.state === MAIL_STATE.DRAFT;
        this.state.SENT = mail.state === MAIL_STATE.SENT;
        this.state.RECEIVED = mail.state === MAIL_STATE.RECEIVED;
        this.stateTitle = MAIL_STATE._.resolveNameByValue(mail.state);

        if (this.state.RECEIVED) {
            this.mailAddress = mail.sender;
            this.mailAddressTotal = 1;
            return;
        }

        this.mailAddress = mail.toRecipients[0];
        this.mailAddressTotal = mail.toRecipients.length + mail.ccRecipients.length + mail.bccRecipients.length;
    }

    @HostBinding("class")
    get unread() {
        return (this.state ? [
            `unread-${Number(this.mail.unread)}`,
            `state-${this.stateTitle}`,
        ] : []).join(" ");
    }
}
