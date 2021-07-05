import UUID from "pure-uuid";
import electronLog from "electron-log";
import fsExtra from "fs-extra";
import {Observable, lastValueFrom, race, throwError, timer} from "rxjs";
import {concatMap, filter, first, mergeMap, tap} from "rxjs/operators";

import {Context} from "src/electron-main/model";
import {
    DbExportMailAttachmentItem,
    MAIL_ATTACHMENTS_EXPORT_NOTIFICATION$
} from "src/electron-main/api/endpoints-builders/database/export/const";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {IpcMainApiEndpoints, IpcMainServiceScan} from "src/shared/api/main-process";
import {curryFunctionMembers} from "src/shared/util";
import {writeFile} from "src/electron-main/api/endpoints-builders/database/export/service";

const logger_ = curryFunctionMembers(electronLog, __filename);

export async function buildDbExportEndpoints(
    ctx: Context,
): Promise<Pick<IpcMainApiEndpoints, "dbExport" | "dbExportMailAttachmentsNotification">> {
    const endpoints: Unpacked<ReturnType<typeof buildDbExportEndpoints>> = {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async dbExportMailAttachmentsNotification(payload) {
            MAIL_ATTACHMENTS_EXPORT_NOTIFICATION$.next(payload);
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        dbExport({exportDir, fileType, login, mailPks, includingAttachments}) {
            const logger = curryFunctionMembers(logger_, nameof(endpoints.dbExport));

            logger.info(JSON.stringify({includingAttachments}));

            return new Observable<IpcMainServiceScan["ApiImplReturns"]["dbExport"]>((subscriber) => {
                if (!fsExtra.pathExistsSync(exportDir)) {
                    return subscriber.error(new Error(`Directory "${exportDir}" doesn't exist`));
                }

                const account = ctx.db.getAccount({login});

                if (!account) {
                    return subscriber.error(new Error(`Failed to resolve account by the provided "type/login"`));
                }

                const mails = mailPks
                    ? Object.values(account.mails).filter(({pk}) => mailPks.includes(pk))
                    : Object.values(account.mails);
                const mailsCount = mails.length;

                logger.verbose(JSON.stringify({mailsCount}));

                subscriber.next({mailsCount});

                let skippedMailAttachments = 0;
                let skippedIndividualAttachments = 0;

                const promise = (async (): Promise<void> => {
                    const config = await lastValueFrom(ctx.config$.pipe(first()));
                    const {timeouts: {attachmentLoadAverage: attachmentLoadAverageTimeoutMs}} = config;

                    for (let mailIndex = 0; mailIndex < mailsCount; mailIndex++) {
                        const mail = mails[mailIndex];

                        if (!mail) {
                            throw new Error("Mail resolving failed");
                        }

                        const loadedAttachments: Array<DbExportMailAttachmentItem> = [];
                        const attachmentsCount = mail.attachments.length;

                        if (includingAttachments && attachmentsCount) {
                            logger.verbose("attachments processing start", JSON.stringify({mailIndex, attachmentsCount}));

                            const uuid = new UUID(4).format();
                            const timeoutMs = attachmentLoadAverageTimeoutMs * attachmentsCount;

                            process.nextTick(() => {
                                IPC_MAIN_API_NOTIFICATION$.next(
                                    IPC_MAIN_API_NOTIFICATION_ACTIONS.DbAttachmentExportRequest({
                                        uuid,
                                        key: {login},
                                        mailPk: mail.pk,
                                        timeoutMs,
                                    }),
                                );
                            });

                            await lastValueFrom(
                                race(
                                    MAIL_ATTACHMENTS_EXPORT_NOTIFICATION$.pipe(
                                        filter((payload) => payload.accountPk.login === login && payload.uuid === uuid),
                                        mergeMap((payload) => {
                                            if ("serializedError" in payload && payload.serializedError) {
                                                skippedMailAttachments += attachmentsCount;
                                                return [{attachments: []}];
                                            }
                                            return [{attachments: payload.attachments}];
                                        }),
                                        first(),
                                        tap(({attachments}) => {
                                            loadedAttachments.push(...attachments);
                                        }),
                                    ),
                                    timer(timeoutMs).pipe(
                                        concatMap(() => throwError(
                                            new Error(
                                                `Attachments downloading failed in ${timeoutMs}ms (${JSON.stringify({mailIndex})})`,
                                            ),
                                        )),
                                    ),
                                ),
                            );

                            logger.verbose("attachments processing end", JSON.stringify({mailIndex}));
                        }

                        const {file} = await writeFile({
                            mail,
                            fileType,
                            exportDir,
                            attachments: loadedAttachments.length ? loadedAttachments : undefined,
                        });
                        const fileNotification = {
                            file,
                            progress: Math.trunc(
                                Number(
                                    ((mailIndex + 1) / mailsCount * 100).toFixed(2),
                                )
                            ),
                            // TODO live attachments export: display attachments load error on the UI
                            attachmentsLoadError: loadedAttachments.some(((at) => "serializedError" in at && Boolean(at.serializedError))),
                        } as const;

                        subscriber.next(fileNotification);

                        if (fileNotification.attachmentsLoadError) {
                            skippedIndividualAttachments++;
                        }
                    }
                })();

                promise
                    .then(() => subscriber.complete())
                    .catch((error) => subscriber.error(error))
                    .finally(() => {
                        const summary = skippedMailAttachments + skippedIndividualAttachments;

                        logger.verbose("finally()", JSON.stringify({skippedMailAttachments, skippedIndividualAttachments, summary}));

                        if (summary) {
                            const message1 = `${summary} attachments loading requests ended up with error.`;

                            logger.error(message1);

                            // TODO live attachments export: consider presenting per email error messages in the UI
                            IPC_MAIN_API_NOTIFICATION$.next(
                                IPC_MAIN_API_NOTIFICATION_ACTIONS.ErrorMessage({
                                    message: message1 + ` See details in the "${String(logger.transports.file.file)}" file.`,
                                }),
                            );
                        }
                    });
            });
        },
    };

    return endpoints;
}
