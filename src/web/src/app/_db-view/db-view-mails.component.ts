import {ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output} from "@angular/core";

import {DbViewMailTabComponent} from "./db-view-mail-tab.component";
import {Instance} from "src/web/src/app/store/reducers/db-view";
import {Mail, View} from "src/shared/model/database";
import {Unpacked} from "src/shared/types";
import {reduceNodesMails} from "src/shared/util";

@Component({
    selector: "email-securely-app-db-view-mails",
    templateUrl: "./db-view-mails.component.html",
    styleUrls: ["./db-view-mails.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsComponent {
    // TODO read "email-securely-app-db-view-mail" dynamically from the annotation
    private static mailComponentTagName = "email-securely-app-db-view-mail";
    conversationViewMode: boolean = false;
    inputState!: Pick<Unpacked<typeof DbViewMailTabComponent.prototype.state$>, "selectedMail" | "rootConversationNodes">
        & { meta: Instance["foldersMeta"][string] };
    @Output()
    selectMailPkHandler = new EventEmitter<Mail["pk"]>();
    @Output()
    toggleRootNodesCollapsingHandler = new EventEmitter<Pick<View.RootConversationNode, "entryPk">>();

    @Input()
    set input(
        input: Pick<Unpacked<typeof DbViewMailTabComponent.prototype.state$>, "folderMeta" | "selectedMail" | "rootConversationNodes">,
    ) {
        this.inputState = {
            meta: input.folderMeta || {
                collapsibleNodes: {},
                rootNodesCollapsed: {},
                mails: reduceNodesMails(input.rootConversationNodes),
            },
            selectedMail: input.selectedMail,
            rootConversationNodes: input.rootConversationNodes,
        };
    }

    toggleConversationViewMode() {
        this.conversationViewMode = !this.conversationViewMode;
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
        return entryPk in this.inputState.meta.rootNodesCollapsed;
    }

    rootNodeCollapsed({entryPk}: View.RootConversationNode): boolean {
        return Boolean(this.inputState.meta.rootNodesCollapsed[entryPk]);
    }

    nodeHasHiddenMail({entryPk}: View.RootConversationNode): boolean {
        return entryPk in this.inputState.meta.collapsibleNodes;
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
