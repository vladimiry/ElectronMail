import {buffer, concatMap, debounceTime, distinctUntilChanged, filter, map, mergeMap, switchMap, tap, throttleTime} from "rxjs/operators";
import {EMPTY, from, merge, Observable} from "rxjs";
import {pick} from "remeda";
import {serializeError} from "serialize-error";

import {buildDbPatch, buildDbPatchEndpoint} from "./db-patch";
import {curryFunctionMembers, isEntityUpdatesPatchNotEmpty} from "src/shared/util";
import {documentCookiesForCustomScheme} from "src/electron-preload/webview/lib/util";
import {dumpProtonSharedSession} from "src/electron-preload/webview/primary/shared-session";
import {FETCH_NOTIFICATION$} from "src/electron-preload/webview/primary/provider-api/notifications";
import {getLocationHref} from "src/shared/util/web";
import {IpcMainServiceScan} from "src/shared/api/main-process";
import {ONE_SECOND_MS} from "src/shared/const";
import {parseProtonRestModel} from "src/shared/util/entity";
import {PROTON_PRIMARY_IPC_WEBVIEW_API, ProtonPrimaryApi, ProtonPrimaryNotificationOutput} from "src/shared/api/webview/primary";
import {ProviderApi} from "src/electron-preload/webview/primary/provider-api/model";
import {resolveIpcMainApi} from "src/electron-preload/lib/util";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";
import {SYSTEM_FOLDER_IDENTIFIERS} from "src/shared/model/database";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, __filename);

const resolveCookieSessionStoragePatch = (): IpcMainServiceScan["ApiImplReturns"]["resolvedSavedSessionStoragePatch"] => {
    // https://github.com/expo/tough-cookie-web-storage-store/blob/36a20183dad5f84f2c14ae87251737dbbeb2af88/WebStorageCookieStore.js#L12
    // TODO move "__cookieStore__" to external/reusable constant
    const sessionStorageCookieStoreKey = {"tough-cookie-web-storage-store": {storageCookieKey: "__cookieStore__"}} as const;
    const {"tough-cookie-web-storage-store": {storageCookieKey}} = sessionStorageCookieStoreKey;
    const {__cookieStore__} = {[storageCookieKey]: window.sessionStorage.getItem(storageCookieKey)};
    return __cookieStore__ ? {__cookieStore__} : null;
};

export function registerApi(providerApi: ProviderApi): void {
    const endpoints: ProtonPrimaryApi = {
        ...buildDbPatchEndpoint(providerApi),

        async ping({accountIndex}) {
            return {value: JSON.stringify({accountIndex})};
        },

        async selectMailOnline(input) {
            _logger.info(nameof(endpoints.selectMailOnline), input.accountIndex);

            const mailSettingsModel = await providerApi._custom_.getMailSettingsModel();
            const messagesViewMode = mailSettingsModel.ViewMode === providerApi.constants.VIEW_MODE.SINGLE;
            const {system: systemMailFolderIds, custom: [customFolderId]} = input.mail.mailFolderIds.reduce(
                (accumulator: {
                     readonly system: typeof input.mail.mailFolderIds; // can't be empty
                     readonly custom: Array<Unpacked<typeof input.mail.mailFolderIds> | undefined>; // can be empty
                 },
                 folderId,
                ) => {
                    const mailFolderIds = accumulator[SYSTEM_FOLDER_IDENTIFIERS._.isValidValue(folderId) ? "system" : "custom"];
                    (mailFolderIds as Mutable<typeof mailFolderIds>).push(folderId);
                    return accumulator;
                },
                {system: [], custom: []},
            );
            const {id: mailId, conversationEntryPk: conversationId} = input.mail;
            // falling back to first value if no other than "all mail" folder resolved
            const [systemFolderId = systemMailFolderIds[0]] = systemMailFolderIds.filter((id) => {
                return id !== SYSTEM_FOLDER_IDENTIFIERS["All Mail"] && id !== SYSTEM_FOLDER_IDENTIFIERS["Almost All Mail"];
            });
            // TODO resolve "folder.id" value from the folder that contains a minimum items count
            //      so narrowest result if multiple items resolved (so protonmail will have to load less data, pagination thing)
            const folderId: string | undefined =
                ( // selected folder gets highest priority
                    input.selectedFolderId
                    &&
                    // TODO throw error if mail is not included in the selected folder
                    input.mail.mailFolderIds.find((id) => id === input.selectedFolderId)
                )
                ??
                customFolderId
                ??
                systemFolderId;

            if (!folderId) {
                throw new Error(`Failed to resolve "folder.id" value`);
            }

            if (messagesViewMode) {
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
            const loadedAttachments: Mutable<IpcMainServiceScan["ApiImplArgs"]["dbExportMailAttachmentsNotification"][0]["attachments"]>
                = [];

            for (const attachment of rawMessage.Attachments) {
                const template = {Headers: attachment.Headers} as const;

                try {
                    const decryptedAttachment = await providerApi.attachmentLoader.getDecryptedAttachment(attachment, rawMessage);

                    loadedAttachments.push({
                        ...template,
                        data: decryptedAttachment.data,
                    });
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
                        pick(error as (Error & { code: unknown }), ["name", "message", "stack", "code"]),
                    );

                    logger.error(
                        // printing mail subject to log helps users locating the problematic item
                        `attachment loading failed (email subject: "${dbMessage.subject}")`,
                        JSON.stringify({index: loadedAttachments.length}),
                        serializedError,
                    );

                    // TODO live attachments export: skip failed calls so export process
                    //      doesn't get cancelled (display skipped mails on the UI)
                    loadedAttachments.push({
                        ...template,
                        serializedError: serializeError(serializedError),
                    });
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

            await ipcMain("dbExportMailAttachmentsNotification")({
                uuid,
                accountPk: {login},
                attachments: loadedAttachments,
            });
        },

        async resolveLiveProtonClientSession({accountIndex}) {
            _logger.info(nameof(endpoints.resolveLiveProtonClientSession), accountIndex);
            return dumpProtonSharedSession();
        },

        async resolvedLiveSessionStoragePatch({accountIndex}) {
            _logger.info(nameof(endpoints.resolvedLiveSessionStoragePatch), accountIndex);
            return resolveCookieSessionStoragePatch();
        },

        notification({login, entryApiUrl, apiEndpointOriginSS, accountIndex}) {
            const logger = curryFunctionMembers(_logger, nameof(endpoints.notification), accountIndex);

            logger.info();

            type LoggedInOutput = Required<Pick<ProtonPrimaryNotificationOutput, "loggedIn">>;
            type UnreadOutput = Required<Pick<ProtonPrimaryNotificationOutput, "unread">>;
            type BatchEntityUpdatesCounterOutput = Required<Pick<ProtonPrimaryNotificationOutput, "batchEntityUpdatesCounter">>;

            const observables: [
                Observable<LoggedInOutput>,
                Observable<UnreadOutput>,
                Observable<BatchEntityUpdatesCounterOutput>
            ] = [
                providerApi._custom_.loggedIn$.pipe(
                    map((loggedIn) => ({loggedIn})),
                ),

                (() => {
                    const isEventsApiUrl = providerApi._custom_.buildEventsApiUrlTester({entryApiUrl});
                    const isMessagesCountApiUrl = providerApi._custom_.buildMessagesCountApiUrlTester({entryApiUrl});
                    const excludeLabelIdsFromUnreadCalculation = ((excludeIds: string[]) => {
                        return (labelID: string) => excludeIds.includes(labelID);
                    })([
                        SYSTEM_FOLDER_IDENTIFIERS.Archive,
                        SYSTEM_FOLDER_IDENTIFIERS.Spam,
                        SYSTEM_FOLDER_IDENTIFIERS.Trash,
                        SYSTEM_FOLDER_IDENTIFIERS["All Mail"],
                        SYSTEM_FOLDER_IDENTIFIERS["Almost All Mail"],
                    ]);
                    const responseListeners = [
                        {
                            tester: {test: isMessagesCountApiUrl},
                            handler: ({Counts}: { Counts?: Array<{ LabelID: string; Unread: number }> }) => {
                                if (!Counts) {
                                    return;
                                }
                                return Counts
                                    .filter(({LabelID}) => !excludeLabelIdsFromUnreadCalculation(LabelID))
                                    .reduce((accumulator, item) => accumulator + item.Unread, 0);
                            },
                        },
                        {
                            tester: {test: isEventsApiUrl},
                            handler: ({MessageCounts}: RestModel.EventResponse) => {
                                if (!MessageCounts) {
                                    return;
                                }
                                return MessageCounts
                                    .filter(({LabelID}) => !excludeLabelIdsFromUnreadCalculation(LabelID))
                                    .reduce((accumulator, item) => accumulator + item.Unread, 0);
                            },
                        },
                    ] as const;

                    return FETCH_NOTIFICATION$.pipe(
                        mergeMap((response) => {
                            const listeners = responseListeners.filter(({tester}) => tester.test(response.url));

                            if (!listeners.length) {
                                return EMPTY;
                            }

                            return from(response.responseTextPromise).pipe(
                                mergeMap((responseText) => {
                                    return listeners.reduce(
                                        (accumulator, {handler}) => {
                                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                                            const responseData = JSON.parse(responseText);
                                            const value = handler(
                                                responseData, // eslint-disable-line @typescript-eslint/no-unsafe-argument
                                            );

                                            return typeof value === "number"
                                                ? accumulator.concat([{unread: value}])
                                                : accumulator;
                                        },
                                        [] as UnreadOutput[],
                                    );
                                })
                            );
                        }),
                        distinctUntilChanged(({unread: prev}, {unread: curr}) => curr === prev),
                    );
                })(),

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
                        buffer(notificationReceived$.pipe(
                            debounceTime(ONE_SECOND_MS * 1.5),
                        )),
                        concatMap((events) => from(buildDbPatch(providerApi, {events, parentLogger: innerLogger}, true))),
                        concatMap((patch) => {
                            if (!isEntityUpdatesPatchNotEmpty(patch)) {
                                return EMPTY;
                            }
                            for (const key of (Object.keys(patch) as Array<keyof typeof patch>)) {
                                innerLogger.verbose(`upsert/remove ${key}: ${patch[key].upsert.length}/${patch[key].remove.length}`);
                            }
                            notification.batchEntityUpdatesCounter++;
                            return [notification];
                        }),
                    );
                })(),
            ];
            const ipcMain = resolveIpcMainApi({logger});

            return merge(
                merge(...observables).pipe(
                    tap((notification) => logger.verbose(JSON.stringify({notification}))),
                ),
                documentCookiesForCustomScheme.setNotification$.pipe(
                    throttleTime(ONE_SECOND_MS / 4),
                    mergeMap(() => {
                        const sessionStorageItem = resolveCookieSessionStoragePatch();
                        return sessionStorageItem
                            ? (
                                from(
                                    ipcMain("saveSessionStoragePatch")({
                                        login,
                                        apiEndpointOrigin: apiEndpointOriginSS,
                                        sessionStorageItem,
                                    }),
                                ).pipe(
                                    switchMap(() => EMPTY),
                                )
                            )
                            : EMPTY;
                    }),
                ),
            );
        },
    };

    PROTON_PRIMARY_IPC_WEBVIEW_API.register(endpoints, {logger: _logger});

    _logger.verbose(`api registered, url: ${getLocationHref()}`);
}
