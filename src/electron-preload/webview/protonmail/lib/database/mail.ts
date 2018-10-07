import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "src/electron-preload/webview/protonmail/lib/rest";
import {Api} from "src/electron-preload/webview/protonmail/lib/api";
import {buildBaseEntity, buildPk} from ".";

const directTypeMapping: Record<keyof typeof Rest.Model.MAIL_TYPE._.nameValueMap, DatabaseModel.Mail["state"]> = {
    [Rest.Model.MAIL_TYPE.INBOX]: DatabaseModel.MAIL_STATE.RECEIVED,
    [Rest.Model.MAIL_TYPE.DRAFT]: DatabaseModel.MAIL_STATE.DRAFT,
    [Rest.Model.MAIL_TYPE.SENT]: DatabaseModel.MAIL_STATE.SENT,
    [Rest.Model.MAIL_TYPE.INBOX_AND_SENT]: DatabaseModel.MAIL_STATE.INBOX_AND_SENT,
};

export async function buildMail(input: Rest.Model.Message, api: Api): Promise<DatabaseModel.Mail> {
    return {
        ...buildBaseEntity(input),
        conversationEntryPk: buildPk(input.ConversationID),
        mailFolderIds: input.LabelIDs,
        sentDate: Number(input.Time),
        subject: input.Subject,
        body: await api.messageModel(input).clearTextBody(),
        sender: Address({...input.Sender, ...buildAddressId(input, "Sender")}),
        toRecipients: input.ToList.map((address, i) => Address({...address, ...buildAddressId(input, "ToList", i)})),
        ccRecipients: input.CCList.map((address, i) => Address({...address, ...buildAddressId(input, "CCList", i)})),
        bccRecipients: input.BCCList.map((address, i) => Address({...address, ...buildAddressId(input, "BCCList", i)})),
        attachments: input.Attachments.map(File),
        unread: !Boolean(input.IsRead),
        state: directTypeMapping[input.Type],
        confidential: Boolean(input.IsEncrypted),
        replyType: (input.IsReplied || input.IsRepliedAll) && input.IsForwarded
            ? DatabaseModel.REPLY_TYPE.REPLY_FORWARD
            : input.IsReplied || input.IsRepliedAll
                ? DatabaseModel.REPLY_TYPE.REPLY
                : input.IsForwarded
                    ? DatabaseModel.REPLY_TYPE.FORWARD
                    : DatabaseModel.REPLY_TYPE.NONE,
    };
}

function buildAddressId(message: Rest.Model.Message, prefix: string, index: number = 0): Pick<Rest.Model.Entity, "ID"> {
    return {ID: `${message.ID}|${prefix}[${index}]`};
}

function Address(input: Rest.Model.MailAddress & Rest.Model.Entity): DatabaseModel.MailAddress {
    return {
        ...buildBaseEntity(input),
        name: input.Name,
        address: input.Address,
    };
}

function File(input: Rest.Model.Attachment): DatabaseModel.File {
    return {
        ...buildBaseEntity(input),
        mimeType: input.MIMEType,
        name: input.Name,
        size: Number(input.Size),
    };
}
