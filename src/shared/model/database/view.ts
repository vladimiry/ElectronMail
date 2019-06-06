import * as Model from ".";

export interface Folder extends Model.Folder {
    size: number;
    unread: number;
    rootConversationNodes: RootConversationNode[];
}

export interface Mail extends Omit<Model.Mail, "raw" | "body" | "attachments"> {
    folders: Folder[];
    score?: number;
}

export interface RootConversationNode extends ConversationNode {
    summary: {
        size: number;
        unread: number;
        maxDate: Model.Mail["sentDate"];
    };
}

export interface ConversationNode {
    entryPk: Model.ConversationEntry["pk"];
    mail?: Mail;
    children: ConversationNode[];
}
