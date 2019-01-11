import {ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output} from "@angular/core";

import {DbViewMailTabComponent} from "./db-view-mail-tab.component";
import {Instance} from "src/web/src/app/store/reducers/db-view";
import {Mail, View} from "src/shared/model/database";
import {Omit, Unpacked} from "src/shared/types";

@Component({
    selector: "email-securely-app-db-view-mails",
    templateUrl: "./db-view-mails.component.html",
    styleUrls: ["./db-view-mails.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsComponent {
    // TODO read "email-securely-app-db-view-mail" dynamically from the DbViewFolderComponent.selector property
    private static mailComponentTagName = "email-securely-app-db-view-mail";

    state!: Pick<Unpacked<typeof DbViewMailTabComponent.prototype.state$>, "selectedMailData">
        & { mails: Instance["selectedFolderMails"][string] }
        & { uid: string }
        & { viewMode: keyof Instance["selectedFolderMails"][string] }
        & { paging: { size: number; page: number; end: number; nextPageSize: number; } };

    @Output()
    selectListMailToDisplayHandler = new EventEmitter<Mail["pk"]>();

    private pageSize = 50;

    @Input()
    set input(input: Omit<typeof DbViewMailsComponent.prototype.state, "paging" | "selectedMailData">) {
        const state = {
            uid: input.uid,
            viewMode: this.state
                ? this.state.viewMode
                : "conversationsView",
            selectedMailData: this.state
                ? this.state.selectedMailData
                : undefined,
            mails: input.mails,
        };
        this.state = {
            ...state,
            paging: this.calculatePaging(state, {reset: !this.state || this.state.uid !== state.uid}),
        };
    }

    @Input()
    set selectedMailData(selectedMailData: Pick<typeof DbViewMailsComponent.prototype.state, "selectedMailData">["selectedMailData"]) {
        this.state = {
            ...(this.state || {}),
            selectedMailData,
        };
    }

    loadMore() {
        this.state.paging = this.calculatePaging(this.state, {increase: true});
    }

    toggleViewMode() {
        const state: typeof DbViewMailsComponent.prototype.state = {
            ...this.state,
            viewMode: this.state.viewMode === "mailsView"
                ? "conversationsView"
                : "mailsView",
        };
        this.state = {
            ...state,
            paging: this.calculatePaging(state, {reset: true}),
        };
    }

    trackByMailPk(index: number, {pk}: View.Mail) {
        return pk;
    }

    @HostListener("click", ["$event"])
    onClick(event: MouseEvent) {
        const target = event.target as Element;
        const mailElement = this.resolveMailComponentElement(target);

        if (!mailElement) {
            return;
        }

        const mailPk: Mail["pk"] | undefined = mailElement.getAttribute("data-pk") as any;

        if (mailPk) {
            this.selectListMailToDisplayHandler.emit(mailPk);
        }
    }

    private calculatePaging(
        state: Omit<typeof DbViewMailsComponent.prototype.state, "paging">,
        {reset = false, increase = reset}: { reset?: boolean; increase?: boolean; } = {},
    ) {
        const size = state.mails[state.viewMode].length;
        const paging: { page: number; nextPageSize: number; } = this.state && !reset
            ? {...this.state.paging}
            : {page: 0, nextPageSize: 0};
        const maxPage = Math.ceil(size / this.pageSize);
        const page = Math.min(paging.page + Number(increase), maxPage);
        const end = Math.min((page * this.pageSize) || this.pageSize, size);
        const nextPageSize = Math.min(size - end, this.pageSize);

        return {size, page, end, nextPageSize};
    }

    private resolveMailComponentElement(element: Element | null): Element | null {
        while (element) {
            if (element.tagName.toLowerCase() === DbViewMailsComponent.mailComponentTagName) {
                return element;
            }
            element = element.parentElement;
        }
        return null;
    }
}
