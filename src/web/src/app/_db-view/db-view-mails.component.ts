import {ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output} from "@angular/core";

import {DbViewMailTabComponent} from "./db-view-mail-tab.component";
import {Instance} from "src/web/src/app/store/reducers/db-view";
import {Mail, View} from "src/shared/model/database";
import {Omit, Unpacked} from "src/shared/types";
import {reduceNodesMails} from "src/shared/util";

@Component({
    selector: "email-securely-app-db-view-mails",
    templateUrl: "./db-view-mails.component.html",
    styleUrls: ["./db-view-mails.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsComponent {
    // TODO read "email-securely-app-db-view-mail" dynamically from the DbViewFolderComponent.selector property
    private static mailComponentTagName = "email-securely-app-db-view-mail";
    state!: Pick<Unpacked<typeof DbViewMailTabComponent.prototype.state$>, "selectedMail" | "rootConversationNodes">
        & { folderMeta: Instance["foldersMeta"][string] }
        & { uid: string }
        & { plainListViewMode: boolean }
        & { paging: { size: number; endIndex: number; nextPageSize: number; } };
    @Output()
    selectMailPkHandler = new EventEmitter<Mail["pk"]>();
    @Output()
    toggleRootNodesCollapsingHandler = new EventEmitter<Pick<View.RootConversationNode, "entryPk">>();
    private pageSize = 50;

    @Input()
    set input(input: Omit<typeof DbViewMailsComponent.prototype.state, "paging" | "selectedMail">) {
        const state = {
            uid: input.uid,
            plainListViewMode: this.state ? this.state.plainListViewMode : true,
            selectedMail: this.state
                ? this.state.selectedMail
                : undefined,
            folderMeta: input.folderMeta || {
                collapsibleNodes: {},
                rootNodesCollapsed: {},
                mails: reduceNodesMails(input.rootConversationNodes),
            },
            rootConversationNodes: input.rootConversationNodes,
        };
        this.state = {
            ...state,
            paging: this.calculatePaging(state, this.state && this.state.uid !== state.uid),
        };
    }

    @Input()
    set selectedMail(selectedMail: Pick<typeof DbViewMailsComponent.prototype.state, "selectedMail">["selectedMail"]) {
        this.state = {
            ...(this.state || {}),
            selectedMail,
        };
    }

    loadMore() {
        this.state.paging = this.calculatePaging(this.state);
    }

    toggleViewMode() {
        const state = {
            ...this.state,
            plainListViewMode: !this.state.plainListViewMode,
        };
        this.state = {
            ...state,
            paging: this.calculatePaging(state, true),
        };
    }

    trackByMailPk(index: number, {pk}: View.Mail) {
        return pk;
    }

    trackByNodeMailPk(index: number, {mail}: View.ConversationNode) {
        return mail ? mail.pk : undefined;
    }

    isEmptyNodes(nodes: View.ConversationNode[]): boolean {
        return nodes.length === 1 && !nodes[0].mail;
    }

    toggleRootNodesCollapsing({entryPk}: View.RootConversationNode): void {
        this.toggleRootNodesCollapsingHandler.emit({entryPk});
    }

    rootNodeHasHiddenMails({entryPk}: View.RootConversationNode): boolean {
        return entryPk in this.state.folderMeta.rootNodesCollapsed;
    }

    rootNodeCollapsed({entryPk}: View.RootConversationNode): boolean {
        return Boolean(this.state.folderMeta.rootNodesCollapsed[entryPk]);
    }

    nodeHasHiddenMail({entryPk}: View.RootConversationNode): boolean {
        return entryPk in this.state.folderMeta.collapsibleNodes;
    }

    @HostListener("click", ["$event"])
    onClick(event: MouseEvent) {
        const target = event.target as Element;
        const mailElement = this.resolveMailComponentElement(target);

        if (target.classList.contains("prevent-default-event")) {
            event.preventDefault();
        }

        if (!mailElement) {
            return;
        }

        this.selectMailPkHandler.emit(mailElement.getAttribute("data-pk") as Mail["pk"]);
    }

    private calculatePaging(state: Omit<typeof DbViewMailsComponent.prototype.state, "paging">, reset: boolean = false) {
        const size = (state.plainListViewMode
            ? state.folderMeta.mails
            : state.rootConversationNodes).length;
        const paging: { endIndex: number; nextPageSize: number; } = this.state && !reset
            ? {...this.state.paging}
            : {endIndex: 0, nextPageSize: 0};
        const add = !this.state || this.state.uid === state.uid || this.state.plainListViewMode !== state.plainListViewMode || reset
            ? this.pageSize
            : 0;
        const maxIndex = size;
        const endIndex = Math.min(
            (paging.endIndex > 0 ? Math.min(paging.endIndex, maxIndex) : paging.endIndex) + add,
            maxIndex,
        );
        const nextPageSize = Math.min(maxIndex - endIndex, this.pageSize);

        return {size, endIndex, nextPageSize};
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
