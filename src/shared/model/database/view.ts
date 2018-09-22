import * as Model from ".";
import {Omit} from "src/shared/types";

export interface Folder extends Model.Folder {
    rootConversationNodes: RootConversationNode[];
}

export interface Mail extends Omit<Model.Mail, "raw" | "body" | "attachments"> {
    folders: Folder[];
}

export interface RootConversationNode extends ConversationNode {
    summary: {
        size: number;
        unread: number;
        sentDateMin: Model.Mail["sentDate"];
        sentDateMax: Model.Mail["sentDate"];
    };
}

export interface ConversationNode {
    entryPk: Model.ConversationEntry["pk"];
    mail?: Mail;
    children: ConversationNode[];
}
