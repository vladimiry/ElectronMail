import {ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output} from "@angular/core";

import {DB_VIEW_ACTIONS} from "src/web/src/app/store/actions";
import {DbViewMailTabComponent} from "./db-view-mail-tab.component";
import {Instance} from "src/web/src/app/store/reducers/db-view";
import {Mail, View} from "src/shared/model/database";
import {Omit, Unpacked} from "src/shared/types";
import {reduceNodesMails, sortMails} from "src/shared/util";

export type ToggleFolderMetadataPropEmitter = Pick<View.RootConversationNode, "entryPk">
    & Pick<Extract<ReturnType<typeof DB_VIEW_ACTIONS.ToggleFolderMetadataProp>, { type: "ToggleFolderMetadataProp" }>["payload"], "prop">;

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
        & { paging: { size: number; page: number; end: number; nextPageSize: number; } };
    @Output()
    selectMailPkHandler = new EventEmitter<Mail["pk"]>();
    @Output()
    toggleFolderMetadataPropHandler = new EventEmitter<ToggleFolderMetadataPropEmitter>();
    private pageSize = 50;

    @Input()
    set input(input: Omit<typeof DbViewMailsComponent.prototype.state, "paging" | "selectedMail">) {
        const state = {
            uid: input.uid,
            plainListViewMode: this.state ? this.state.plainListViewMode : false,
            selectedMail: this.state
                ? this.state.selectedMail
                : undefined,
            folderMeta: input.folderMeta || {
                unmatchedNodes: {},
                unmatchedNodesCollapsed: {},
                mails: sortMails(
                    reduceNodesMails(input.rootConversationNodes),
                ),
            },
            rootConversationNodes: input.rootConversationNodes,
        };
        this.state = {
            ...state,
            paging: this.calculatePaging(state, {reset: !this.state || this.state.uid !== state.uid}),
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
        this.state.paging = this.calculatePaging(this.state, {increase: true});
    }

    toggleViewMode() {
        const state = {
            ...this.state,
            plainListViewMode: !this.state.plainListViewMode,
        };
        this.state = {
            ...state,
            paging: this.calculatePaging(state, {reset: true}),
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

    toggleExpanded({entryPk}: View.RootConversationNode): void {
        this.toggleFolderMetadataPropHandler.emit({entryPk, prop: "expanded"});
    }

    matchedMailsCount({entryPk}: View.RootConversationNode): number {
        return this.state.folderMeta.matchedMailsCount[entryPk];
    }

    mostRecentMatchedMail({entryPk}: View.RootConversationNode): View.Mail {
        return this.state.folderMeta.mostRecentMatchedMails[entryPk];
    }

    expanded({entryPk}: View.RootConversationNode): boolean {
        return Boolean(this.state.folderMeta.expanded[entryPk]);
    }

    toggleUnmatchedCollapsed({entryPk}: View.RootConversationNode): void {
        this.toggleFolderMetadataPropHandler.emit({entryPk, prop: "unmatchedNodesCollapsed"});
    }

    hasUnmatchedNodes({entryPk}: View.RootConversationNode): boolean {
        return entryPk in this.state.folderMeta.unmatchedNodesCollapsed;
    }

    unmatchedNodesCollapsed({entryPk}: View.RootConversationNode): boolean {
        return Boolean(this.state.folderMeta.unmatchedNodesCollapsed[entryPk]);
    }

    nodeHasHiddenMail({entryPk}: View.RootConversationNode): boolean {
        return entryPk in this.state.folderMeta.unmatchedNodes;
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

    private calculatePaging(
        state: Omit<typeof DbViewMailsComponent.prototype.state, "paging">,
        {reset = false, increase = reset}: { reset?: boolean; increase?: boolean; } = {},
    ) {
        const size = (state.plainListViewMode
            ? state.folderMeta.mails
            : state.rootConversationNodes).length;
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
