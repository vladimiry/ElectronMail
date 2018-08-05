import {Observable, Subscriber} from "rxjs";

import * as DatabaseModel from "src/shared/model/database";
import {curryFunctionMembers, MailFolderTypeService} from "src/shared/util";
import {fetchEntitiesList, fetchEntitiesRange, fetchEntity, Model as M} from "src/electron-preload/webview/tutanota/lib/rest";
import {FetchMessagesInput, FetchMessagesOutput} from "src/shared/api/webview/common";
import {Id} from "./rest/model";
import {resolveWebClientApi} from "src/electron-preload/webview/tutanota/lib/tutanota-api";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, "[lib/fetcher]");
const MAIL_FOLDER_FETCH_PORTION_SIZE = 500;

export function fetchMessages(
    input: { user: M.User } & FetchMessagesInput,
): Observable<FetchMessagesOutput> {
    const logger = curryFunctionMembers(_logger, "fetchMessages()");
    logger.info();

    return Observable.create(async (mailItemFetchingObserver: Subscriber<FetchMessagesOutput>) => {
        const api = await resolveWebClientApi();
        const {FULL_INDEXED_TIMESTAMP: TIMESTAMP_MIN} = api["src/api/common/TutanotaConstants"];
        const {timestampToGeneratedId, generatedIdToTimestamp} = api["src/api/common/utils/Encoding"];
        const newestStoredTimestamp = typeof input.rawNewestTimestamp === "undefined" ? TIMESTAMP_MIN
            : generatedIdToTimestamp(input.rawNewestTimestamp) + 1;
        const startId = timestampToGeneratedId(newestStoredTimestamp);
        const startTime = +new Date();
        logger.verbose(`startId: ${typeof input.rawNewestTimestamp === "undefined" ? "initial" : '"rawNewestTimestamp" based'}`);

        for (const folder of await fetchUserFoldersWithSubFolders(input.user)) {
            const folderProcessingStartTime = +new Date();

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

            logger.verbose(`folder processed in ${+new Date() - folderProcessingStartTime}ms`);
        }

        mailItemFetchingObserver.complete();

        logger.verbose(`all folders processed in ${+new Date() - startTime}ms`);
    });
}

export async function fetchUserFoldersWithSubFolders(user: M.User) {
    const logger = curryFunctionMembers(_logger, "fetchUserFoldersWithSubFolders()");
    logger.info();

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

    logger.verbose(`${folders.length} folders fetched`);

    return folders;
}

function processMailFolder(
    context: FetchMessagesInput,
    folder: M.MailFolder,
    startId: Id<M.Mail["_id"][1]>,
): Observable<FetchMessagesOutput["mail"]> {
    return Observable.create(async (mailItemFetchingObserver: Subscriber<FetchMessagesOutput["mail"]>) => {
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
    {type, login}: FetchMessagesInput,
    folder: M.MailFolder,
    mail: M.Mail,
    body: M.MailBody,
    files: M.File[],
): FetchMessagesOutput["mail"] {
    return {
        raw: JSON.stringify(mail),
        type,
        login,
        id: mail._id[1],
        date: Number(mail.receivedDate), // TODO consider calling "generatedIdToTimestamp" on "mail._id[1]"
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
