import {EMPTY, Observable, from, interval, merge} from "rxjs";
import {buffer, concatMap, debounceTime, distinctUntilChanged, filter, first, map, mergeMap, tap, withLatestFrom} from "rxjs/operators";
import {pick} from "remeda";
import {serializeError} from "serialize-error";

import * as RestModel from "src/electron-preload/webview/lib/rest-model";
import * as WebviewConstants from "src/electron-preload/webview/lib/const";
import {FETCH_NOTIFICATION$} from "src/electron-preload/webview/primary/provider-api/notifications";
import {IpcMainServiceScan} from "src/shared/api/main";
import {ONE_SECOND_MS, WEB_VIEW_SESSION_STORAGE_KEY_SKIP_LOGIN_DELAYS} from "src/shared/constants";
import {PROTON_PRIMARY_IPC_WEBVIEW_API, ProtonPrimaryApi, ProtonPrimaryNotificationOutput} from "src/shared/api/webview/primary";
import {ProviderApi} from "src/electron-preload/webview/primary/provider-api/model";
import {SYSTEM_FOLDER_IDENTIFIERS} from "src/shared/model/database";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";
import {buildDbPatch, buildDbPatchEndpoint} from "src/electron-preload/webview/primary/api/build-db-patch";
import {curryFunctionMembers, isEntityUpdatesPatchNotEmpty, parseProtonRestModel} from "src/shared/util";
import {dumpProtonSharedSession} from "src/electron-preload/webview/primary/shared-session";
import {fillInputValue, getLocationHref, resolveDomElements, submitTotpToken,} from "src/electron-preload/webview/lib/util";
import {resolveIpcMainApi} from "src/electron-preload/lib/util";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, "[api/index]");

export function registerApi(providerApi: ProviderApi): void {
    const endpoints: ProtonPrimaryApi = {
        ...buildDbPatchEndpoint(providerApi),

        async ping() {}, // eslint-disable-line @typescript-eslint/no-empty-function

        async selectMailOnline(input) {
            _logger.info("selectMailOnline()", input.accountIndex);

            const {ViewMode: viewMode} = await providerApi._custom_.cachedMailSettingsModel$
                .pipe(first())
                .toPromise();
            const messagesViewMode = viewMode === providerApi.constants.VIEW_MODE.SINGLE;
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
            const [systemFolderId = systemMailFolderIds[0] /* falling back to first value if no other than "all mail" folder resolved */]
                = systemMailFolderIds.filter((id) => id !== SYSTEM_FOLDER_IDENTIFIERS["All Mail"]);
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
            _logger.info("makeMailRead()", input.accountIndex);

            await providerApi.message.markMessageAsRead(input.messageIds);

            // TODO consider triggering the "refresh" action (clicking the "refresh" button action in "proton ui")
        },

        async deleteMessages({messageIds, accountIndex}) {
            _logger.info("deleteMessages()", accountIndex);

            await providerApi.message.deleteMessages(messageIds);

            // TODO consider triggering the "refresh" action (clicking the "refresh" button action in "proton ui")
        },

        async setMailFolder(input) {
            _logger.info("setMailFolder()", input.accountIndex);

            await providerApi.message.labelMessages({LabelID: input.folderId, IDs: input.messageIds});

            // TODO consider triggering the "refresh" action (clicking the "refresh" button action in "proton ui")
        },

        async exportMailAttachments({uuid, mailPk, login, accountIndex}) {
            const logger = curryFunctionMembers(_logger, "exportMailAttachments()", accountIndex);

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
                        pick(error, ["name", "message", "stack", "code"]), // eslint-disable-line @typescript-eslint/no-unsafe-member-access
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

        async fillLogin({login, accountIndex}) {
            const logger = curryFunctionMembers(_logger, "fillLogin()", accountIndex);

            logger.info();

            const elements = await resolveDomElements(
                {
                    username: () => document.querySelector<HTMLInputElement>("form[name=loginForm] #login"),
                },
                logger,
            );
            logger.verbose(`elements resolved`);

            fillInputValue(elements.username, login);
            logger.verbose(`input values filled`);

            elements.username.readOnly = true;
        },

        async login({login, password, accountIndex}) {
            const logger = curryFunctionMembers(_logger, "login()", accountIndex);

            logger.info();

            await endpoints.fillLogin({login, accountIndex});
            logger.verbose(`fillLogin() executed`);

            const elements = await resolveDomElements(
                {
                    password: () => document.querySelector<HTMLInputElement>("form[name=loginForm] #password"),
                    submit: () => document.querySelector<HTMLElement>("form[name=loginForm] [type=submit]"),
                },
                logger,
            );
            logger.verbose(`elements resolved`);

            if (elements.password.value) {
                throw new Error(`Password is not supposed to be filled already on "login" stage`);
            }

            fillInputValue(elements.password, password);
            logger.verbose(`input values filled`);

            elements.submit.click();
            logger.verbose(`clicked`);
        },

        async login2fa({secret, accountIndex}) {
            const logger = curryFunctionMembers(_logger, "login2fa()", accountIndex);

            logger.info();

            const resolveElementsConfig = {
                input: () => document.querySelector<HTMLInputElement>("form[name=totpForm] #twoFa"),
                button: () => document.querySelector<HTMLElement>("form[name=totpForm] [type=submit]"),
            };
            const elements = await resolveDomElements(resolveElementsConfig, logger);

            logger.verbose("elements resolved");

            return submitTotpToken(
                elements.input,
                elements.button,
                async () => {
                    const response = await resolveIpcMainApi({logger})("generateTOTPToken")({secret});
                    return response.token;
                },
                logger,
                {
                    submittingDetection: async () => {
                        try {
                            await resolveDomElements(resolveElementsConfig, logger, {iterationsLimit: 1});
                        } catch {
                            return true;
                        }
                        return false;
                    },
                },
            );
        },

        async unlock({mailPassword, accountIndex}) {
            const logger = curryFunctionMembers(_logger, "unlock()", accountIndex);

            logger.info("unlock()", accountIndex);

            const elements = await resolveDomElements(
                {
                    mailboxPassword: () => document.querySelector<HTMLInputElement>("form[name=unlockForm] #password"),
                    submit: () => document.querySelector<HTMLElement>("form[name=unlockForm] [type=submit]"),
                },
                logger,
            );

            fillInputValue(elements.mailboxPassword, mailPassword);
            elements.submit.click();
        },

        async resolveSavedProtonClientSession() {
            return dumpProtonSharedSession();
        },

        notification({entryApiUrl, accountIndex}) {
            const logger = curryFunctionMembers(_logger, "notification()", accountIndex);

            logger.info();

            type LoggedInOutput = Required<Pick<ProtonPrimaryNotificationOutput, "loggedIn">>;
            type PageTypeOutput = Required<Pick<ProtonPrimaryNotificationOutput, "pageType">>;
            type UnreadOutput = Required<Pick<ProtonPrimaryNotificationOutput, "unread">>;
            type BatchEntityUpdatesCounterOutput = Required<Pick<ProtonPrimaryNotificationOutput, "batchEntityUpdatesCounter">>;

            const observables: [
                Observable<LoggedInOutput>,
                Observable<PageTypeOutput>,
                Observable<UnreadOutput>,
                Observable<BatchEntityUpdatesCounterOutput>
            ] = [
                providerApi._custom_.loggedIn$.pipe(
                    map((loggedIn) => ({loggedIn})),
                    tap(({loggedIn}) => {
                        if (loggedIn) {
                            window.sessionStorage.removeItem(WEB_VIEW_SESSION_STORAGE_KEY_SKIP_LOGIN_DELAYS);
                        }
                    }),
                ),

                // TODO listen instead of polling
                interval(WebviewConstants.NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL).pipe(
                    withLatestFrom(providerApi._custom_.loggedIn$),
                    map(
                        (() => {
                            const formNamesToPageTypeMapping
                                = new Map([["loginForm", "login"], ["totpForm", "login2fa"], ["unlockForm", "unlock"]] as const);

                            return ([, loggedIn]: [number, boolean]) => {
                                const pageType: PageTypeOutput["pageType"] = {type: "unknown"};

                                if (!loggedIn) {
                                    for (const [formName, type] of formNamesToPageTypeMapping) {
                                        if (
                                            // test for form element and it's visibility
                                            document.querySelector<HTMLFormElement>(`form[name=${formName}]`)?.offsetParent
                                        ) {
                                            pageType.type = type;
                                            break;
                                        }
                                    }
                                }

                                return {pageType};
                            };
                        })(),
                    ),
                    distinctUntilChanged(({pageType: prev}, {pageType: curr}) => curr.type === prev.type),
                    map((value) => {
                        if (value.pageType.type !== "login") {
                            return value;
                        }

                        const pageType: typeof value.pageType = {
                            ...value.pageType,
                            skipLoginDelayLogic: Boolean(
                                window.sessionStorage.getItem(WEB_VIEW_SESSION_STORAGE_KEY_SKIP_LOGIN_DELAYS),
                            ),
                        };

                        window.sessionStorage.removeItem(WEB_VIEW_SESSION_STORAGE_KEY_SKIP_LOGIN_DELAYS);

                        return {pageType};
                    }),
                ),

                (() => {
                    const isEventsApiUrl = providerApi._custom_.buildEventsApiUrlTester({entryApiUrl});
                    const isMessagesCountApiUrl = providerApi._custom_.buildMessagesCountApiUrlTester({entryApiUrl});
                    const responseListeners = [
                        {
                            tester: {test: isMessagesCountApiUrl},
                            handler: ({Counts}: { Counts?: Array<{ LabelID: string; Unread: number }> }) => {
                                if (!Counts) {
                                    return;
                                }
                                return Counts
                                    .filter(({LabelID}) => LabelID === SYSTEM_FOLDER_IDENTIFIERS.Inbox)
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
                                    .filter(({LabelID}) => LabelID === SYSTEM_FOLDER_IDENTIFIERS.Inbox)
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
                                            const value = handler(responseData);

                                            return typeof value === "number"
                                                ? accumulator.concat([{unread: value}])
                                                : accumulator;
                                        },
                                        [] as UnreadOutput[],
                                    );
                                })
                            );
                        }),
                        distinctUntilChanged((prev, curr) => curr.unread === prev.unread),
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

            return merge(...observables).pipe(
                tap((notification) => logger.verbose(JSON.stringify({notification}))),
            );
        },
    };

    PROTON_PRIMARY_IPC_WEBVIEW_API.register(endpoints, {logger: _logger});

    _logger.verbose(`api registered, url: ${getLocationHref()}`);
}
