import * as Model from ".";

export interface Folder extends Model.Folder {
    rootConversationNodes: RootConversationNode[];
}

export interface Mail extends Model.Mail {
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
    mail?: Mail;
    children: ConversationNode[];
}
