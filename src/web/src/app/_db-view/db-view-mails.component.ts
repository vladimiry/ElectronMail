import {ChangeDetectionStrategy, Component, HostListener, Input} from "@angular/core";

import {View} from "src/shared/model/database";
import {walkConversationNodesTree} from "src/shared/util";

// TODO consider storing DbViewMailsComponent's state in the central state, passing only the "selectedFolderPk" @Input attribute
// so app doesn't re-calculate the state each time user changes the selected folder
@Component({
    selector: "email-securely-app-db-view-mails",
    templateUrl: "./db-view-mails.component.html",
    styleUrls: ["./db-view-mails.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsComponent {
    conversationViewMode: boolean = false;
    rootConversationNodes!: View.RootConversationNode[];
    mails!: View.Mail[];
    private hiddenRootNodesMap!: WeakMap<View.RootConversationNode, boolean>;
    private hiddenNodesMap!: WeakMap<View.ConversationNode, boolean>;

    @Input()
    set input({rootConversationNodes, selectedFolderPk}: {
        rootConversationNodes: View.RootConversationNode[];
        selectedFolderPk?: View.Folder["pk"];
    }) {
        this.rootConversationNodes = rootConversationNodes;
        this.mails = [];

        this.hiddenRootNodesMap = new WeakMap<View.RootConversationNode, boolean>();
        this.hiddenNodesMap = new WeakMap<View.ConversationNode, boolean>();

        for (const rootConversationNode of this.rootConversationNodes) {
            let rootNodeHasHiddenMails: boolean = false;

            walkConversationNodesTree([rootConversationNode], (node) => {
                const mail = node.mail;
                const nodeHasHiddenMail = Boolean(
                    selectedFolderPk && mail && !mail.folders.some((folder) => folder.pk === selectedFolderPk),
                );

                if (nodeHasHiddenMail) {
                    this.hiddenNodesMap.set(node, nodeHasHiddenMail);
                } else if (mail) {
                    this.mails.push(mail);
                }

                rootNodeHasHiddenMails = rootNodeHasHiddenMails || nodeHasHiddenMail;
            });

            if (rootNodeHasHiddenMails) {
                this.hiddenRootNodesMap.set(rootConversationNode, rootNodeHasHiddenMails);
            }
        }

        this.mails.sort((o1, o2) => o2.sentDate - o1.sentDate);
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

    toggleRootNodeHiddenMailsVisibility(node: View.RootConversationNode): void {
        const value = this.hiddenRootNodesMap.get(node);

        if (typeof value === "undefined") {
            return;
        }

        this.hiddenRootNodesMap.set(node, !value);
    }

    rootNodeHasHiddenMails(node: View.RootConversationNode): boolean {
        return this.hiddenRootNodesMap.has(node);
    }

    rootNodeCollapsed(node: View.RootConversationNode): boolean {
        return Boolean(this.hiddenRootNodesMap.get(node));
    }

    nodeHasHiddenMail(node: View.RootConversationNode): boolean {
        return this.hiddenNodesMap.has(node);
    }

    @HostListener("click", ["$event"])
    onClick(event: MouseEvent) {
        if (!event.srcElement || !event.srcElement.classList.contains("sender")) {
            return;
        }
        event.preventDefault();
    }
}
