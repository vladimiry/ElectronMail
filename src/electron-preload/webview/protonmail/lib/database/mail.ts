import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "src/electron-preload/webview/protonmail/lib/rest";
import {ONE_SECOND_MS, PACKAGE_VERSION} from "src/shared/constants";
import {ProviderApi} from "src/electron-preload/webview/protonmail/lib/provider-api";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {buildBaseEntity, buildPk} from ".";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.protonmail, "[lib/database/mail]");

const directTypeMapping: Record<keyof typeof Rest.Model.MAIL_TYPE._.nameValueMap, DatabaseModel.Mail["state"]> = {
    [Rest.Model.MAIL_TYPE.INBOX]: DatabaseModel.MAIL_STATE.RECEIVED,
    [Rest.Model.MAIL_TYPE.DRAFT]: DatabaseModel.MAIL_STATE.DRAFT,
    [Rest.Model.MAIL_TYPE.SENT]: DatabaseModel.MAIL_STATE.SENT,
    [Rest.Model.MAIL_TYPE.INBOX_AND_SENT]: DatabaseModel.MAIL_STATE.INBOX_AND_SENT,
};

const isConfidential = ((encryptedValues: Array<Rest.Model.Message["IsEncrypted"]>) => {
    return ({IsEncrypted}: Pick<Rest.Model.Message, "IsEncrypted">) => encryptedValues.includes(IsEncrypted);
})([
    // Rest.Model.ENCRYPTED_STATUS.NONE,
    Rest.Model.ENCRYPTED_STATUS.INTERNAL,
    // Rest.Model.ENCRYPTED_STATUS.EXTERNAL,
    Rest.Model.ENCRYPTED_STATUS.OUT_ENC,
    Rest.Model.ENCRYPTED_STATUS.OUT_PLAIN,
    Rest.Model.ENCRYPTED_STATUS.STORED_ENC,
    Rest.Model.ENCRYPTED_STATUS.PGP_INLINE,
    Rest.Model.ENCRYPTED_STATUS.PGP_MIME,
    Rest.Model.ENCRYPTED_STATUS.PGP_MIME_SIGNED,
    // Rest.Model.ENCRYPTED_STATUS.AUTOREPLY,
]);

export async function buildMail(input: Rest.Model.Message, api: ProviderApi): Promise<DatabaseModel.Mail> {
    const bodyPart: Pick<DatabaseModel.Mail, "body" | "failedDownload"> = {
        body: "",
    };

    try {
        bodyPart.body = await api.messageModel(input).clearTextBody();
    } catch (error) {
        logger.error(`body decryption failed, email subject: "${input.Subject}"`, error);

        bodyPart.failedDownload = {
            appVersion: PACKAGE_VERSION,
            date: Number(new Date()),
            errorMessage: String(error.message),
            errorStack: String(error.stack),
            type: "body-decrypting",
        };
    }

    return {
        ...buildBaseEntity(input),
        conversationEntryPk: buildPk(input.ConversationID),
        mailFolderIds: input.LabelIDs,
        sentDate: input.Time * ONE_SECOND_MS,
        subject: input.Subject,
        ...bodyPart,
        sender: Address({...input.Sender, ...buildAddressId(input, "Sender")}),
        toRecipients: input.ToList.map((address, i) => Address({...address, ...buildAddressId(input, "ToList", i)})),
        ccRecipients: input.CCList.map((address, i) => Address({...address, ...buildAddressId(input, "CCList", i)})),
        bccRecipients: input.BCCList.map((address, i) => Address({...address, ...buildAddressId(input, "BCCList", i)})),
        attachments: input.Attachments.map(File),
        unread: Boolean(input.Unread),
        state: directTypeMapping[input.Type],
        confidential: isConfidential(input),
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
