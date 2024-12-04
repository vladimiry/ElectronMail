import {buildBaseEntity, buildPk} from "src/electron-preload/webview/lib/database-entity/index";
import {buildLoggerBundle} from "src/electron-preload/lib/util";
import * as DatabaseModel from "src/shared/model/database";
import {isErrorOnRateLimitedMethodCall} from "src/electron-preload/webview/lib/util";
import {lzutf8Util} from "src/shared/util/entity";
import {MessagesResponse} from "src/electron-preload/webview/lib/rest-model";
import {MIME_TYPES} from "src/shared/model/database";
import {ONE_SECOND_MS, PACKAGE_VERSION} from "src/shared/const";
import {ProviderApi} from "src/electron-preload/webview/primary/mail/provider-api/model";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";

const logger = buildLoggerBundle(__filename);

const directTypeMapping: Readonly<Record<Unpacked<typeof RestModel.MAIL_TYPE._.values>, DatabaseModel.Mail["state"]>> = {
    [RestModel.MAIL_TYPE.INBOX]: DatabaseModel.MAIL_STATE.RECEIVED,
    [RestModel.MAIL_TYPE.DRAFT]: DatabaseModel.MAIL_STATE.DRAFT,
    [RestModel.MAIL_TYPE.SENT]: DatabaseModel.MAIL_STATE.SENT,
    [RestModel.MAIL_TYPE.PROTONMAIL_INBOX_AND_SENT]: DatabaseModel.MAIL_STATE.PROTONMAIL_INBOX_AND_SENT,
};

function buildAddressId({ID}: Pick<RestModel.Message, "ID">, prefix: string, index = 0): Pick<RestModel.Entity, "ID"> {
    return {ID: `${ID}|${prefix}[${index}]`};
}

function Address(input: RestModel.MailAddress & RestModel.Entity): DatabaseModel.MailAddress {
    return {...buildBaseEntity(input), name: input.Name, address: input.Address};
}

function File(input: RestModel.Attachment): DatabaseModel.File {
    return {...buildBaseEntity(input), mimeType: input.MIMEType, name: input.Name, size: Number(input.Size)};
}

const isConfidential = ((encryptedValues: Array<RestModel.Message["IsEncrypted"]>) => {
    return ({IsEncrypted}: Pick<RestModel.Message, "IsEncrypted">) => encryptedValues.includes(IsEncrypted);
})([
    // Rest.ENCRYPTED_STATUS.NONE,
    RestModel.ENCRYPTED_STATUS.INTERNAL,
    // Rest.ENCRYPTED_STATUS.EXTERNAL,
    RestModel.ENCRYPTED_STATUS.OUT_ENC,
    RestModel.ENCRYPTED_STATUS.OUT_PLAIN,
    RestModel.ENCRYPTED_STATUS.STORED_ENC,
    RestModel.ENCRYPTED_STATUS.PGP_INLINE,
    RestModel.ENCRYPTED_STATUS.PGP_MIME,
    RestModel.ENCRYPTED_STATUS.PGP_MIME_SIGNED,
    // Rest.ENCRYPTED_STATUS.AUTOREPLY,
]);

export async function buildMail(
    input: RestModel.Message | MessagesResponse["Messages"][number],
    api: ProviderApi,
    failedDownload?: DatabaseModel.Mail["failedDownload"],
): Promise<DatabaseModel.Mail> {
    const bodyPart: Mutable<Pick<DatabaseModel.Mail, "body" | "bodyCompression" | "failedDownload">> = {body: ""};
    let subject = input.Subject;

    if (!failedDownload) {
        if (!("Attachments" in input) || !("MIMEType" in input)) {
            throw new Error(`Complete message expected. Use "${nameof.full(api.message.getMessage)}" API to get it.`);
        }

        try {
            const {decryptedSubject, decryptedBody} = await api._custom_.decryptMessage(input);

            if (decryptedSubject) {
                subject = decryptedSubject;
            }

            if (lzutf8Util.shouldCompress(decryptedBody)) {
                bodyPart.body = lzutf8Util.compress(decryptedBody);
                bodyPart.bodyCompression = "lzutf8";
            } else {
                bodyPart.body = decryptedBody;
            }
        } catch (error) {
            if (isErrorOnRateLimitedMethodCall(error)) {
                throw error;
            }
            // printing mail subject to log helps users locating the problematic item
            logger.error(`body decryption failed, email subject: "${subject}"`, error);
            bodyPart.failedDownload = {
                type: "body-decrypting",
                appVersion: PACKAGE_VERSION,
                date: Date.now(),
                errorMessage: String((error as Error).message), // eslint-disable-line @typescript-eslint/no-unsafe-member-access
                errorStack: String((error as Error).stack), // eslint-disable-line @typescript-eslint/no-unsafe-member-access
            };
        }
    } else {
        bodyPart.failedDownload = failedDownload;
    }

    return {
        ...buildBaseEntity(input),
        conversationEntryPk: buildPk(input.ConversationID),
        mailFolderIds: input.LabelIDs,
        sentDate: input.Time * ONE_SECOND_MS,
        subject,
        ...bodyPart,
        sender: Address({...input.Sender, ...buildAddressId(input, "Sender")}),
        toRecipients: input.ToList.map((address, i) => Address({...address, ...buildAddressId(input, "ToList", i)})),
        ccRecipients: input.CCList.map((address, i) => Address({...address, ...buildAddressId(input, "CCList", i)})),
        bccRecipients: input.BCCList.map((address, i) => Address({...address, ...buildAddressId(input, "BCCList", i)})),
        attachments: ("Attachments" in input ? input.Attachments : []).map(File),
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
        mimeType: "MIMEType" in input
            ? input.MIMEType
            : MIME_TYPES.AUTOMATIC,
    };
}
