import {equals} from "ramda";

import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "src/electron-preload/webview/tutanota/lib/rest";
import {buildBaseEntity, buildPk} from ".";
import {mapBy} from "src/shared/util";
import {resolveInstanceId, resolveListId} from "src/electron-preload/webview/tutanota/lib/util";

export async function buildMails(mails: Rest.Model.Mail[]): Promise<DatabaseModel.Mail[]> {
    const [bodies, files] = await Promise.all([
        // WARN: don't set huge chunk size for mails body loading
        // or server will response with timeout error on "/rest/tutanota/mailbody/" request
        await Rest.fetchMultipleEntities(Rest.Model.MailBodyTypeRef, null, mails.map(({body}) => body), 50),
        await (async () => {
            const attachmentsIds = mails.reduce((accumulator: typeof mail.attachments, mail) => [...accumulator, ...mail.attachments], []);
            const attachmentsMap = mapBy(attachmentsIds, (_id) => resolveListId({_id}));
            const attachments: Rest.Model.File[] = [];

            for (const [listId, fileIds] of attachmentsMap.entries()) {
                const instanceIds = fileIds.map(((_id) => resolveInstanceId({_id})));
                attachments.push(...await Rest.fetchMultipleEntities(Rest.Model.FileTypeRef, listId, instanceIds));
            }

            return attachments;
        })(),
    ]);

    return mails.reduce((result: DatabaseModel.Mail[], mail) => {
        const body = bodies.find(({_id}) => _id === mail.body);

        if (!body) {
            throw new Error(`Failed to resolve mail body by "body._id"=${mail.body}`);
        }

        return [
            ...result,
            Mail(
                mail,
                body,
                files.filter((file) => mail.attachments.find((attachmentId) => equals(attachmentId, file._id))),
            ),
        ];
    }, []);
}

function Mail(input: Rest.Model.Mail, body: Rest.Model.MailBody, files: Rest.Model.File[]): DatabaseModel.Mail {
    return {
        ...buildBaseEntity(input),
        conversationEntryPk: buildPk(input.conversationEntry),
        mailFolderIds: [resolveListId(input)],
        sentDate: Number(input.sentDate),
        subject: input.subject,
        body: body.text,
        sender: Address(input.sender),
        toRecipients: input.toRecipients.map(Address),
        ccRecipients: input.ccRecipients.map(Address),
        bccRecipients: input.bccRecipients.map(Address),
        attachments: files.map(File),
        unread: Boolean(input.unread),
        state: DatabaseModel.MAIL_STATE._.parseValue(input.state),
        confidential: input.confidential,
        replyType: input.replyType,
    };
}

function Address(input: Rest.Model.MailAddress): DatabaseModel.MailAddress {
    return {
        ...buildBaseEntity(input),
        name: input.name,
        address: input.address,
    };
}

function File(input: Rest.Model.File): DatabaseModel.File {
    return {
        ...buildBaseEntity(input),
        mimeType: input.mimeType,
        name: input.name,
        size: Number(input.size),
    };
}
