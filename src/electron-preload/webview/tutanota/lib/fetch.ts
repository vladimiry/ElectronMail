import {Observable, Subscriber} from "rxjs";

import {fetchEntitiesList, fetchEntitiesRange, fetchEntity, Model as M} from "src/electron-preload/webview/tutanota/lib/rest";
import {MailFolderRef} from "src/electron-preload/webview/tutanota/lib/rest/model/entity";
import {resolveWebClientApi} from "src/electron-preload/webview/tutanota/tutanota-api";
import {TutanotaApiFetchMessagesInput, TutanotaApiFetchMessagesOutput} from "src/shared/api/webview/tutanota";

const MAIL_FOLDER_FETCH_PORTION_SIZE = 500;

export function fetchMessages(
    {user, newestStoredTimestamp}: { user: M.User } & TutanotaApiFetchMessagesInput,
): Observable<TutanotaApiFetchMessagesOutput> {
    return Observable.create(async (mailItemFetchingObserver: Subscriber<TutanotaApiFetchMessagesOutput>) => {
        const api = await resolveWebClientApi();
        const {FULL_INDEXED_TIMESTAMP: TIMESTAMP_MIN} = api["src/api/common/TutanotaConstants"];
        const {timestampToGeneratedId} = api["src/api/common/utils/Encoding"];
        const startTimestamp = typeof newestStoredTimestamp === "undefined" ? TIMESTAMP_MIN : newestStoredTimestamp + 1;
        const startId = timestampToGeneratedId(startTimestamp);
        const mailGroups = user.memberships.filter(({groupType}) => groupType === M.GroupType.Mail);

        for (const {group} of mailGroups) {
            const {mailbox} = await fetchEntity(M.MailboxGroupRootTypeRef, group);
            const {systemFolders} = await fetchEntity(M.MailBoxTypeRef, mailbox);

            if (!systemFolders) {
                continue;
            }

            for (const folder of await fetchFoldersWithSubFolders(systemFolders)) {
                await new Promise((resolve, reject) => {
                    processMailFolder(folder, startId).subscribe(
                        (mailItem) => {
                            mailItemFetchingObserver.next({mailItem});
                        },
                        reject,
                        resolve,
                    );
                });
            }

            mailItemFetchingObserver.complete();
        }
    });
}

function processMailFolder(
    mailFolder: M.MailFolder,
    startId: M.Id<M.Mail>,
): Observable<TutanotaApiFetchMessagesOutput["mailItem"]> {
    return Observable.create(async (mailItemFetchingObserver: Subscriber<TutanotaApiFetchMessagesOutput["mailItem"]>) => {
        const {timestampToGeneratedId, generatedIdToTimestamp} = (await resolveWebClientApi())["src/api/common/utils/Encoding"];
        const count = MAIL_FOLDER_FETCH_PORTION_SIZE;
        const mails = await fetchEntitiesRange(
            M.MailTypeRef,
            mailFolder.mails,
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
                Promise.all(mail.attachments.map((attachmentId) => fetchEntity(M.FileTypeRef, attachmentId))),
            ]);

            mailItemFetchingObserver.next({mail, body, files});
        }

        if (fullPortionFetched && mail) {
            const currentPortionEndId = mail._id[1];
            const currentPortionEndTimestamp = generatedIdToTimestamp(currentPortionEndId);
            const nextPortionStartId = timestampToGeneratedId(currentPortionEndTimestamp + 1);

            processMailFolder(mailFolder, nextPortionStartId).subscribe(
                (value) => mailItemFetchingObserver.next(value),
                (error) => mailItemFetchingObserver.error(error),
                () => mailItemFetchingObserver.complete(),
            );

            return;
        }

        mailItemFetchingObserver.complete();
    });
}

async function fetchFoldersWithSubFolders({folders: listId}: MailFolderRef): Promise<M.MailFolder[]> {
    const folders = [];

    for (const folder of await fetchEntitiesList(M.MailFolderTypeRef, listId)) {
        folders.push(folder);
        folders.push(...await fetchEntitiesList(M.MailFolderTypeRef, folder.subFolders));
    }

    return folders;
}
