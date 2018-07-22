import {Observable, Subscriber} from "rxjs";

import * as DatabaseModel from "src/shared/model/database";
import {fetchEntitiesList, fetchEntitiesRange, fetchEntity, Model as M} from "src/electron-preload/webview/tutanota/lib/rest";
import {Id} from "./rest/model";
import {MailFolderTypeService} from "src/shared/util";
import {resolveWebClientApi} from "src/electron-preload/webview/tutanota/lib/tutanota-api";
import {TutanotaApiFetchMessagesInput, TutanotaApiFetchMessagesOutput} from "src/shared/api/webview/tutanota";

const MAIL_FOLDER_FETCH_PORTION_SIZE = 500;

export function fetchMessages(
    input: { user: M.User } & TutanotaApiFetchMessagesInput,
): Observable<TutanotaApiFetchMessagesOutput> {
    return Observable.create(async (mailItemFetchingObserver: Subscriber<TutanotaApiFetchMessagesOutput>) => {
        const api = await resolveWebClientApi();
        const {FULL_INDEXED_TIMESTAMP: TIMESTAMP_MIN} = api["src/api/common/TutanotaConstants"];
        const {timestampToGeneratedId} = api["src/api/common/utils/Encoding"];
        const startTimestamp = typeof input.newestStoredTimestamp === "undefined" ? TIMESTAMP_MIN : input.newestStoredTimestamp + 1;
        const startId = timestampToGeneratedId(startTimestamp);

        for (const folder of await fetchUserFoldersWithSubFolders(input.user)) {
            await new Promise((resolve, reject) => {
                // TODO consider requesting "newestStoredTimestamp" from database right here, on each folder fetching iteration
                processMailFolder(input, folder, startId).subscribe(
                    (mail) => {
                        mailItemFetchingObserver.next({mail});
                    },
                    reject,
                    resolve,
                );
            });
        }

        mailItemFetchingObserver.complete();
    });
}

export async function fetchUserFoldersWithSubFolders(user: M.User) {
    const folders: M.MailFolder[] = [];
    const userMailGroups = user.memberships.filter(({groupType}) => groupType === M.GroupType.Mail);

    for (const {group} of userMailGroups) {
        const {mailbox} = await fetchEntity(M.MailboxGroupRootTypeRef, group);
        const {systemFolders} = await fetchEntity(M.MailBoxTypeRef, mailbox);

        if (!systemFolders) {
            continue;
        }

        for (const folder of await fetchEntitiesList(M.MailFolderTypeRef, systemFolders.folders)) {
            folders.push(folder);
            folders.push(...await fetchEntitiesList(M.MailFolderTypeRef, folder.subFolders));
        }
    }

    return folders;
}

function processMailFolder(
    context: TutanotaApiFetchMessagesInput,
    folder: M.MailFolder,
    startId: Id<M.Mail["_id"][1]>,
): Observable<TutanotaApiFetchMessagesOutput["mail"]> {
    return Observable.create(async (mailItemFetchingObserver: Subscriber<TutanotaApiFetchMessagesOutput["mail"]>) => {
        const {timestampToGeneratedId, generatedIdToTimestamp} = (await resolveWebClientApi())["src/api/common/utils/Encoding"];
        const count = MAIL_FOLDER_FETCH_PORTION_SIZE;
        const mails = await fetchEntitiesRange(
            M.MailTypeRef,
            folder.mails,
            {
                count,
                start: startId,
                reverse: false,
            },
        );
        const fullPortionFetched = mails.length && mails.length === count;
        let mail: M.Mail | undefined;

        for (mail of mails) {
            const [body, files] = await Promise.all([
                fetchEntity(M.MailBodyTypeRef, mail.body),
                Promise.all(mail.attachments.map((id) => fetchEntity(M.FileTypeRef, id))),
            ]);
            mailItemFetchingObserver.next(formDatabaseMailModel(context, folder, mail, body, files));
        }

        if (fullPortionFetched && mail) {
            const currentPortionEndId = mail._id[1];
            const currentPortionEndTimestamp = generatedIdToTimestamp(currentPortionEndId);
            const nextPortionStartId = timestampToGeneratedId(currentPortionEndTimestamp + 1);

            processMailFolder(context, folder, nextPortionStartId).subscribe(
                (value) => mailItemFetchingObserver.next(value),
                (error) => mailItemFetchingObserver.error(error),
                () => mailItemFetchingObserver.complete(),
            );

            return;
        }

        mailItemFetchingObserver.complete();
    });
}

function formDatabaseMailModel(
    {type, login}: TutanotaApiFetchMessagesInput,
    folder: M.MailFolder,
    mail: M.Mail,
    body: M.MailBody,
    files: M.File[],
): TutanotaApiFetchMessagesOutput["mail"] {
    return {
        raw: JSON.stringify(mail),
        type,
        login,
        id: mail._id[1],
        date: Number(mail.receivedDate), // TODO consider calling "generatedIdToTimestamp"
        subject: mail.subject,
        body: body.text,
        folder: {
            raw: JSON.stringify(folder),
            type: MailFolderTypeService.parseValueStrict(folder.folderType),
            name: folder.name,
        },
        sender: formDatabaseAddressModel(mail.sender),
        toRecipients: mail.toRecipients.map(formDatabaseAddressModel),
        ccRecipients: mail.ccRecipients.map(formDatabaseAddressModel),
        bccRecipients: mail.bccRecipients.map(formDatabaseAddressModel),
        attachments: files.map(formDatabaseFileModel),
        unread: Boolean(mail.unread),
    };
}

function formDatabaseAddressModel(input: M.MailAddress): DatabaseModel.MailAddress {
    return {
        raw: JSON.stringify(input),
        name: input.name,
        address: input.address,
    };
}

function formDatabaseFileModel(input: M.File): DatabaseModel.File {
    return {
        raw: JSON.stringify(input),
        mimeType: input.mimeType,
        name: input.name,
        size: Number(input.size),
    };
}
