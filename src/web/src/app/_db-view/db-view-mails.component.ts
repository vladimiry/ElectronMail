import {ChangeDetectionStrategy, Component, Input} from "@angular/core";

import {View} from "src/shared/model/database";
import {walkConversationNodesTree} from "src/shared/util";

@Component({
    selector: "email-securely-app-db-view-mails",
    templateUrl: "./db-view-mails.component.html",
    styleUrls: ["./db-view-mails.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsComponent {
    rootConversationNodes!: View.RootConversationNode[];

    private hiddenRootNodesMap!: WeakMap<View.RootConversationNode, boolean>;
    private hiddenNodesMap!: WeakMap<View.ConversationNode, boolean>;

    @Input()
    set input({rootConversationNodes, selectedFolderPk}: {
        rootConversationNodes: View.RootConversationNode[];
        selectedFolderPk?: View.Folder["pk"],
    }) {
        this.rootConversationNodes = rootConversationNodes;

        this.hiddenRootNodesMap = new WeakMap<View.RootConversationNode, boolean>();
        this.hiddenNodesMap = new WeakMap<View.ConversationNode, boolean>();

        for (const rootConversationNode of this.rootConversationNodes) {
            let rootNodeHasHiddenMails: boolean = false;

            // TODO move "walkConversationNodesTree" call to the "DbViewService"
            walkConversationNodesTree([rootConversationNode], (node) => {
                const nodeHasHiddenMail = Boolean(
                    selectedFolderPk && node.mail && !node.mail.folders.some((folder) => folder.pk === selectedFolderPk),
                );

                if (nodeHasHiddenMail) {
                    this.hiddenNodesMap.set(node, nodeHasHiddenMail);
                }

                rootNodeHasHiddenMails = rootNodeHasHiddenMails || nodeHasHiddenMail;
            });

            if (rootNodeHasHiddenMails) {
                this.hiddenRootNodesMap.set(rootConversationNode, rootNodeHasHiddenMails);
            }
        }
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
}
