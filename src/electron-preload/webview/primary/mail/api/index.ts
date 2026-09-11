import {buffer, concatMap, debounceTime, distinctUntilChanged, filter, map, mergeMap, tap} from "rxjs/operators";
import {EMPTY, from, merge, Observable, of} from "rxjs";
import {ipcRenderer} from "electron";
import {pick} from "remeda";
import {serializeError} from "serialize-error";

import {buildDbPatch, buildDbPatchEndpoint} from "./db-patch";
import {ProviderApi as CommonProviderApi} from "src/electron-preload/webview/primary/common/provider-api";
import {curryFunctionMembers, isEntityUpdatesPatchNotEmpty} from "src/shared/util";
import {FETCH_NOTIFICATION$} from "../provider-api/notifications";
import {getLocationHref} from "src/shared/util/web";
import {IPC_WEBVIEW_API_CHANNELS_MAP} from "src/shared/api/webview/const";
import {IpcMainServiceScan} from "src/shared/api/main-process";
import {ONE_SECOND_MS} from "src/shared/const";
import {parseProtonRestModel} from "src/shared/util/entity";
import {PROTON_PRIMARY_MAIL_IPC_WEBVIEW_API, ProtonPrimaryMailApi} from "src/shared/api/webview/primary-mail";
import {ProviderApi} from "src/electron-preload/webview/primary/mail/provider-api/model";
import {resolveIpcMainApi} from "src/electron-preload/lib/util";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";
import {SYSTEM_FOLDER_IDENTIFIERS} from "src/shared/model/database";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, __filename);

export function registerApi(commonProviderApi: CommonProviderApi, providerApi: ProviderApi): void {
    // currenlty it's safe to cache the once resoved value, as "view mode" doesn't change dynamically but only with page reload
    // but here by not caching the value we make it future-proofed for dynamical vide mode change
    const isMessagesViewMode = async (): Promise<boolean> => {
        const mailSettingsModel = await providerApi._custom_.getMailSettingsModel();
        return mailSettingsModel.ViewMode === providerApi.constants.VIEW_MODE.SINGLE;
    };
    const endpoints: ProtonPrimaryMailApi = {
        ...buildDbPatchEndpoint(commonProviderApi, providerApi),

        async selectMailOnline(input) {
            _logger.info(nameof(endpoints.selectMailOnline), input.accountIndex);

            const {system: systemMailFolderIds, custom: [customFolderId]} = input.mail.mailFolderIds.reduce((accumulator: {
                readonly system: typeof input.mail.mailFolderIds; // can't be empty
                readonly custom: Array<Unpacked<typeof input.mail.mailFolderIds> | undefined>; // can be empty
            }, folderId) => {
                const mailFolderIds = accumulator[SYSTEM_FOLDER_IDENTIFIERS._.isValidValue(folderId) ? "system" : "custom"];
                (mailFolderIds as Mutable<typeof mailFolderIds>).push(folderId);
                return accumulator;
            }, {system: [], custom: []});
            const {id: mailId, conversationEntryPk: conversationId} = input.mail;
            // falling back to first value if no other than "all mail" folder resolved
            const [systemFolderId = systemMailFolderIds[0]] = systemMailFolderIds.filter((id) => {
                return id !== SYSTEM_FOLDER_IDENTIFIERS["All Mail"] && id !== SYSTEM_FOLDER_IDENTIFIERS["Almost All Mail"];
            });
            // TODO resolve "folder.id" value from the folder that contains a minimum items count
            //      so narrowest result if multiple items resolved (so protonmail will have to load less data, pagination thing)
            const folderId: string | undefined = ( // selected folder gets highest priority
                input.selectedFolderId
                // TODO throw error if mail is not included in the selected folder
                && input.mail.mailFolderIds.find((id) => id === input.selectedFolderId)
            ) ?? customFolderId ?? systemFolderId;

            if (!folderId) {
                throw new Error(`Failed to resolve "folder.id" value`);
            }

            if (await isMessagesViewMode()) {
                await providerApi.history.push({folderId, mailId});
            } else {
                await providerApi.history.push({folderId, conversationId, mailId});
            }
        },

        async makeMailRead(input) {
            _logger.info(nameof(endpoints.makeMailRead), input.accountIndex);

            await providerApi.message.markMessageAsRead(input.messageIds);

            // TODO consider triggering the "refresh" action (clicking the "refresh" button action in "proton ui")
        },

        async deleteMessages({messageIds, accountIndex}) {
            _logger.info(nameof(endpoints.deleteMessages), accountIndex);

            await providerApi.message.deleteMessages(messageIds);

            // TODO consider triggering the "refresh" action (clicking the "refresh" button action in "proton ui")
        },

        async setMailFolder(input) {
            _logger.info(nameof(endpoints.setMailFolder), input.accountIndex);

            await providerApi.message.labelMessages({LabelID: input.folderId, IDs: input.messageIds});

            // TODO consider triggering the "refresh" action (clicking the "refresh" button action in "proton ui")
        },

        async exportMailAttachments({uuid, mailPk, login, accountIndex}) {
            const logger = curryFunctionMembers(_logger, nameof(endpoints.exportMailAttachments), accountIndex);

            logger.info();

            const ipcMain = resolveIpcMainApi({logger: _logger});
            const dbMessage = await ipcMain("dbGetAccountMail")({pk: mailPk, login});
            const rawMessage = parseProtonRestModel(dbMessage);
            const loadedAttachments: Mutable<IpcMainServiceScan["ApiImplArgs"]["dbExportMailAttachmentsNotification"][0]["attachments"]> =
                [];

            for (const attachment of rawMessage.Attachments) {
                const template = {Headers: attachment.Headers} as const;

                try {
                    const decryptedAttachment = await providerApi.attachmentLoader.getDecryptedAttachment(attachment, rawMessage);

                    loadedAttachments.push({...template, data: decryptedAttachment.data});
                } catch (error) {
                    /* eslint-disable max-len */
                    // TODO live attachments export: process custom "{data: attachment, binary: blob, error}" exception type:
                    //      see https://github.com/ProtonMail/proton-mail/blob/2ab916e847bfe8064f5ff321c50f1028adf547e1/src/app/helpers/attachment/attachmentLoader.ts#L97
                    //      we should probably:
                    //        - skip such kind of error but notify user about that: DONE (see code below)
                    //        - and maybe falling back to exporting the raw/encrypted attachment data, see "error.binary" prop: NOT DONE
                    /* eslint-enable max-len */
                    const serializedError = serializeError(
                        // sanitizing the error (original error might include the "data"/other props which we don't want to log)
                        pick(error as (Error & {code: unknown}), ["name", "message", "stack", "code"]),
                    );

                    logger.error(
                        // printing mail subject to log helps users locating the problematic item
                        `attachment loading failed (email subject: "${dbMessage.subject}")`,
                        JSON.stringify({index: loadedAttachments.length}),
                        serializedError,
                    );

                    // TODO live attachments export: skip failed calls so export process
                    //      doesn't get cancelled (display skipped mails on the UI)
                    loadedAttachments.push({...template, serializedError: serializeError(serializedError)});
                }
            }

            if (dbMessage.attachments.length !== loadedAttachments.length) {
                throw new Error(
                    [
                        `Invalid attachments content items array length (`,
                        `expected/db: ${String(dbMessage.attachments.length)}; actual/loaded: ${String(loadedAttachments.length)}`,
                        `)`,
                    ].join(""),
                );
            }

            await ipcMain("dbExportMailAttachmentsNotification")({uuid, accountPk: {login}, attachments: loadedAttachments});
        },

        notification({entryApiUrl, accountIndex}) {
            const logger = curryFunctionMembers(_logger, nameof(endpoints.notification), accountIndex);

            logger.info();

            const observables = [
                // stub "unread" update signal, makes "notification" signal something to prevent timeout
                of({unread: 0}),

                // "unread" update signal
                (() => {
                    type T1 = (arg: {Counts?: Array<{LabelID: string; Unread: number}>}) => number;
                    type T2 = (arg: RestModel.EventResponse) => number | undefined;
                    const ALMOST_ALL_MAIL = SYSTEM_FOLDER_IDENTIFIERS["Almost All Mail"];
                    const resolveResponseListeners = async (): Promise<
                        readonly [
                            {testUrl: (arg: string) => boolean; resolveUnreadValue: T1},
                            {testUrl: (arg: string) => boolean; resolveUnreadValue: T2},
                        ]
                    > => {
                        const messagesViewMode = await isMessagesViewMode();
                        return [
                            {
                                testUrl: messagesViewMode
                                    ? providerApi._custom_.buildMessagesCountApiUrlTester({entryApiUrl})
                                    : providerApi._custom_.buildConversationsCountApiUrlTester({entryApiUrl}),
                                resolveUnreadValue: (...[{Counts}]: Parameters<T1>) => {
                                    return Counts?.find(({LabelID}) => LabelID === ALMOST_ALL_MAIL)?.Unread ?? 0;
                                },
                            },
                            {
                                testUrl: providerApi._custom_.buildEventsApiUrlTester({entryApiUrl}),
                                resolveUnreadValue: (...[{MessageCounts, ConversationCounts}]: Parameters<T2>) => {
                                    const items = messagesViewMode ? MessageCounts : ConversationCounts;
                                    // WARN: this test is required as we must not process the events without server signalling with
                                    //       filled "MessageCounts" or "ConversationCounts" list
                                    if (!items) return;
                                    return items.find(({LabelID}) => LabelID === ALMOST_ALL_MAIL)?.Unread ?? 0;
                                },
                            },
                        ] as const;
                    };
                    return FETCH_NOTIFICATION$.pipe(
                        mergeMap((response) => {
                            return from(resolveResponseListeners()).pipe(
                                mergeMap((responseListeners) => {
                                    const listeners = responseListeners.filter(({testUrl}) => testUrl(response.url));
                                    if (!listeners.length) return EMPTY;
                                    return from(response.responseTextPromise).pipe(mergeMap((responseText) => {
                                        return listeners.reduce((accumulator, {resolveUnreadValue}) => {
                                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                                            const responseData = JSON.parse(responseText);
                                            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                                            const unread = resolveUnreadValue(responseData);
                                            return typeof unread === "number" ? accumulator.concat([{unread}]) : accumulator;
                                        }, [] as Array<{unread: number}>);
                                    }));
                                }),
                            );
                        }),
                        distinctUntilChanged(({unread: prev}, {unread: curr}) => curr === prev),
                    );
                })(),

                // batch entity updates signal
                (() => {
                    const innerLogger = curryFunctionMembers(logger, `[entity update notification]`);
                    const isEventsApiUrl = providerApi._custom_.buildEventsApiUrlTester({entryApiUrl});
                    const notification = {batchEntityUpdatesCounter: 0};
                    const notificationReceived$: Observable<RestModel.EventResponse> = FETCH_NOTIFICATION$.pipe(
                        filter((response) => isEventsApiUrl(response.url)),
                        mergeMap((response) => from(response.responseTextPromise)),
                        map((responseText) => {
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                            const parsed: RestModel.EventResponse = JSON.parse(responseText);
                            if (typeof parsed?.EventID !== "string") {
                                throw new Error(`Invalid Event type`);
                            }
                            return parsed;
                        }),
                    );

                    return notificationReceived$.pipe(
                        buffer(notificationReceived$.pipe(debounceTime(ONE_SECOND_MS * 1.5))),
                        concatMap((events) => from(buildDbPatch(providerApi, {events, parentLogger: innerLogger}, true))),
                        concatMap((patch) => { // eslint-disable-line sonarjs/function-return-type
                            if (!isEntityUpdatesPatchNotEmpty(patch)) {
                                return EMPTY;
                            }
                            for (const key of (Object.keys(patch) as Array<keyof typeof patch>)) {
                                innerLogger.verbose(
                                    `upsert/remove ${String(key)}: ${patch[key].upsert.length}/${patch[key].remove.length}`,
                                );
                            }
                            notification.batchEntityUpdatesCounter++;
                            return [notification];
                        }),
                    );
                })(),
            ] as const;

            return merge(...observables)
                .pipe(tap((notification) => logger.verbose(JSON.stringify({notification}))));
        },
    };

    PROTON_PRIMARY_MAIL_IPC_WEBVIEW_API.register(endpoints, {logger: _logger});
    ipcRenderer.sendToHost(IPC_WEBVIEW_API_CHANNELS_MAP.mail.registered);
    _logger.verbose(`api registered, url: ${getLocationHref()}`);
}
