import * as Model from ".";

export interface Folder extends Mutable<Model.Folder> {
    size: number;
    unread: number;
    rootConversationNodes: RootConversationNode[];
}

export type Mail = StrictOmit<Model.Mail, "raw" | "body" | "attachments"> & NoExtraProperties<{
    folders: Folder[];
    score?: number;
    attachmentsCount: number;
}>

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
