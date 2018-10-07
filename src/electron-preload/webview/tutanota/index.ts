import {Observable, Subscriber, from, interval, merge, of} from "rxjs";
import {authenticator} from "otplib";
import {concatMap, distinctUntilChanged, map, tap} from "rxjs/operators";
import {pick} from "ramda";

import * as Database from "./lib/database";
import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "./lib/rest";
import {DbPatch} from "src/shared/api/common";
import {MAIL_FOLDER_TYPE} from "src/shared/model/database";
import {
    NOTIFICATION_LOGGED_IN_POLLING_INTERVAL,
    NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL,
    WEBVIEW_LOGGERS,
} from "src/electron-preload/webview/constants";
import {ONE_SECOND_MS} from "src/shared/constants";
import {TUTANOTA_IPC_WEBVIEW_API, TutanotaApi, TutanotaNotificationOutput} from "src/shared/api/webview/tutanota";
import {Unpacked} from "src/shared/types";
import {asyncDelay, curryFunctionMembers, isEntityUpdatesPatchNotEmpty} from "src/shared/util";
import {buildLoggerBundle} from "src/electron-preload/util";
import {fetchEntitiesRange, fetchMultipleEntities} from "src/electron-preload/webview/tutanota/lib/rest";
import {fillInputValue, getLocationHref, submitTotpToken, waitElements} from "src/electron-preload/webview/util";
import {isUpsertOperationType} from "./lib/rest/util";
import {resolveApi} from "src/electron-preload/webview/tutanota/lib/api";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, "[index]");
const WINDOW = window as any;

delete WINDOW.Notification;

resolveApi()
    .then(bootstrapApi)
    .catch(_logger.error);

function bootstrapApi(api: Unpacked<ReturnType<typeof resolveApi>>) {
    const {GENERATED_MAX_ID} = api["src/api/common/EntityFunctions"];
    const login2FaWaitElementsConfig = {
        input: () => document.querySelector("#modal input.input") as HTMLInputElement,
        button: () => document.querySelector("#modal input.input ~ div > button") as HTMLElement,
    };
    const endpoints: TutanotaApi = {
        ping: () => of(null),

        buildDbPatch: (input) => from((async (logger = curryFunctionMembers(_logger, "api:buildDbPatch()", input.zoneName)) => {
            logger.info();

            const controller = getUserController();

            if (!controller || !isLoggedIn()) {
                throw new Error("tutanota:buildDbPatch(): user is supposed to be logged-in");
            }

            const eventBatches: Rest.Model.EntityEventBatch[] = [];
            const metadata: Unpacked<ReturnType<TutanotaApi["buildDbPatch"]>>["metadata"] = {
                groupEntityEventBatchIds: {},
            };
            const memberships = Rest.Util.filterSyncingMemberships(controller.user);

            for (const {group} of memberships) {
                const startId = await Rest.Util.generateStartId(
                    input.metadata ? input.metadata.groupEntityEventBatchIds[group] : undefined,
                );
                const fetchedEventBatches = await Rest.fetchEntitiesRangeUntilTheEnd(
                    Rest.Model.EntityEventBatchTypeRef,
                    group,
                    {start: startId, count: 500},
                );
                if (fetchedEventBatches.length) {
                    metadata.groupEntityEventBatchIds[group] =
                        Rest.Util.resolveInstanceId(fetchedEventBatches[fetchedEventBatches.length - 1]);
                }
                eventBatches.push(...fetchedEventBatches);
            }
            logger.verbose(
                `fetched ${eventBatches.length} entity event batches from ${memberships.length} syncing memberships`,
            );

            const patch = await buildDbPatch({eventBatches, _logger: logger});

            return {
                ...patch,
                metadata,
            };
        })()),

        fillLogin: ({login, zoneName}) => from((async (logger = curryFunctionMembers(_logger, "api:fillLogin()", zoneName)) => {
            logger.info();

            const cancelEvenHandler = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
            };
            const elements = await waitElements({
                username: () => document.querySelector("form [type=email]") as HTMLInputElement,
                storePasswordCheckbox: () => document.querySelector("form .items-center [type=checkbox]") as HTMLInputElement,
                storePasswordCheckboxBlock: () => document.querySelector("form .checkbox.pt.click") as HTMLInputElement,
            });
            logger.verbose(`elements resolved`);

            await fillInputValue(elements.username, login);
            elements.username.readOnly = true;
            logger.verbose(`input values filled`);

            elements.storePasswordCheckbox.checked = false;
            elements.storePasswordCheckbox.disabled = true;
            elements.storePasswordCheckboxBlock.removeEventListener("click", cancelEvenHandler);
            elements.storePasswordCheckboxBlock.addEventListener("click", cancelEvenHandler, true);
            logger.verbose(`"store" checkbox disabled`);

            return null;
        })()),

        login: ({login, password, zoneName}) => from((async (logger = curryFunctionMembers(_logger, "api:login()", zoneName)) => {
            logger.info();

            await endpoints.fillLogin({login, zoneName}).toPromise();
            logger.verbose(`fillLogin() executed`);

            const elements = await waitElements({
                password: () => document.querySelector("form [type=password]") as HTMLInputElement,
                submit: () => document.querySelector("form button") as HTMLElement,
            });
            logger.verbose(`elements resolved`);

            if (elements.password.value) {
                throw new Error(`Password is not supposed to be filled already on "login" stage`);
            }

            await fillInputValue(elements.password, password);
            logger.verbose(`input values filled`);

            elements.submit.click();
            logger.verbose(`clicked`);

            return null;
        })()),

        login2fa: ({secret, zoneName}) => from((async () => {
            const logger = curryFunctionMembers(_logger, "api:login2fa()", zoneName);
            logger.info();

            const elements = await waitElements(login2FaWaitElementsConfig);
            logger.verbose(`elements resolved`);

            const spacesLessSecret = secret.replace(/\s/g, "");

            return await submitTotpToken(
                elements.input,
                elements.button,
                () => authenticator.generate(spacesLessSecret),
                logger,
            );
        })()),

        notification: ({entryUrl, zoneName}) => {
            const logger = curryFunctionMembers(_logger, "api:notification()", zoneName);
            logger.info();

            type LoggedInOutput = Required<Pick<TutanotaNotificationOutput, "loggedIn">>;
            type PageTypeOutput = Required<Pick<TutanotaNotificationOutput, "pageType">>;
            type UnreadOutput = Required<Pick<TutanotaNotificationOutput, "unread">>;
            type BatchEntityUpdatesCounterOutput = Required<Pick<TutanotaNotificationOutput, "batchEntityUpdatesCounter">>;

            // TODO add "entity event batches" listening notification instead of the polling
            // so app reacts to the mails/folders updates instantly

            const observables: [
                Observable<LoggedInOutput>,
                Observable<PageTypeOutput>,
                Observable<UnreadOutput>,
                Observable<BatchEntityUpdatesCounterOutput>
                ] = [
                interval(NOTIFICATION_LOGGED_IN_POLLING_INTERVAL).pipe(
                    map(() => isLoggedIn()),
                    distinctUntilChanged(),
                    map((loggedIn) => ({loggedIn})),
                ),

                // TODO listen for location.href change instead of starting polling interval
                interval(NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL).pipe(
                    concatMap(() => from((async () => {
                        const url = getLocationHref();
                        const pageType: PageTypeOutput["pageType"] = {url, type: "unknown"};
                        const loginUrlDetected = (url === `${entryUrl}/login` || url.startsWith(`${entryUrl}/login?`));

                        if (loginUrlDetected && !isLoggedIn()) {
                            let twoFactorElements;

                            try {
                                twoFactorElements = await waitElements(login2FaWaitElementsConfig, {iterationsLimit: 1});
                            } catch (e) {
                                // NOOP
                            }

                            const twoFactorCodeVisible = twoFactorElements
                                && twoFactorElements.input.offsetParent
                                && twoFactorElements.button.offsetParent;

                            if (twoFactorCodeVisible) {
                                pageType.type = "login2fa";
                            } else {
                                pageType.type = "login";
                            }
                        }

                        return {pageType};
                    })())),
                    distinctUntilChanged(({pageType: prev}, {pageType: curr}) => curr.type === prev.type),
                    tap((value) => logger.verbose(JSON.stringify(value))),
                ),

                // TODO listen for "unread" change instead of starting polling interval
                Observable.create((observer: Subscriber<UnreadOutput>) => {
                    const notifyUnreadValue = async () => {
                        const controller = getUserController();

                        if (!controller || !isLoggedIn() || !navigator.onLine) {
                            return;
                        }

                        const folders = await Rest.Util.fetchMailFoldersWithSubFolders(controller.user);
                        const inboxFolder = folders.find(({folderType}) => folderType === MAIL_FOLDER_TYPE.INBOX);

                        if (!inboxFolder) {
                            return;
                        }

                        const emails = await fetchEntitiesRange(
                            Rest.Model.MailTypeRef,
                            inboxFolder.mails,
                            {
                                count: 50,
                                reverse: true,
                                start: GENERATED_MAX_ID,
                            },
                        );
                        const unread = emails.reduce((sum, mail) => sum + Number(mail.unread), 0);

                        observer.next({unread});
                    };

                    setInterval(notifyUnreadValue, ONE_SECOND_MS * 60);
                    setTimeout(notifyUnreadValue, ONE_SECOND_MS * 15);
                }).pipe(
                    // all the values need to be sent to stream to get proper unread value after disabling database syncing
                    // distinctUntilChanged(({unread: prev}, {unread: curr}) => curr === prev),
                ),

                Observable.create((subscriber: Subscriber<BatchEntityUpdatesCounterOutput>) => {
                    const innerLogger = curryFunctionMembers(logger, `[entity update notification]`);
                    const notification = {batchEntityUpdatesCounter: 0};
                    const {EntityEventController} = api["src/api/main/EntityEventController"];

                    EntityEventController.prototype.notificationReceived = ((original) => function(
                        this: typeof EntityEventController,
                        entityUpdate: Rest.Model.EntityUpdate,
                    ) {
                        (async () => {
                            innerLogger.verbose(JSON.stringify(pick(["application", "type", "operation"], entityUpdate)));

                            const patch = await buildDbPatch(
                                {eventBatches: [{events: [entityUpdate]}]/*, _logger: logger*/},
                                true,
                            );

                            if (!isEntityUpdatesPatchNotEmpty(patch)) {
                                return;
                            }

                            // reduce 404 error chance in case of just created mail immediately goes from "drat" to the "sent" folder
                            await asyncDelay(ONE_SECOND_MS / 2);

                            notification.batchEntityUpdatesCounter++;
                            subscriber.next(notification);

                            for (const key of (Object.keys(patch) as Array<keyof typeof patch>)) {
                                innerLogger.info(`upsert/remove ${key}: ${patch[key].upsert.length}/${patch[key].remove.length}`);
                            }
                        })().catch((error) => {
                            subscriber.error(error);
                            innerLogger.error(error);
                        });

                        return original.apply(this, arguments);
                    })(EntityEventController.prototype.notificationReceived);
                }),
            ];

            return merge(...observables);
        },
    };

    TUTANOTA_IPC_WEBVIEW_API.registerApi(endpoints);
    _logger.verbose(`api registered, url: ${getLocationHref()}`);
}

async function buildDbPatch(
    input: {
        eventBatches: Array<Pick<Rest.Model.EntityEventBatch, "events">>;
        _logger?: ReturnType<typeof buildLoggerBundle>;
    },
    nullUpsert: boolean = false,
): Promise<DbPatch> {
    const logger = input._logger
        ? curryFunctionMembers(input._logger, "buildDbPatch()")
        : {info: (...args: any[]) => {}, verbose: (...args: any[]) => {}};
    const mappingItem = () => ({updatesMappedByInstanceId: new Map(), remove: [], idsMappedByListId: new Map()});
    const mapping: Record<"conversationEntries" | "mails" | "folders" | "contacts", {
        updatesMappedByInstanceId: Map<Rest.Model.Id, Rest.Model.EntityUpdate[]>;
        remove: Array<{ pk: string }>;
        idsMappedByListId: Map<Rest.Model.Id, Rest.Model.Id[]>;
    }> & {
        conversationEntries: { refType: Rest.Model.TypeRef<Rest.Model.ConversationEntry> },
        mails: { refType: Rest.Model.TypeRef<Rest.Model.Mail> },
        folders: { refType: Rest.Model.TypeRef<Rest.Model.MailFolder> },
        contacts: { refType: Rest.Model.TypeRef<Rest.Model.Contact> },
    } = {
        conversationEntries: {refType: Rest.Model.ConversationEntryTypeRef, ...mappingItem()},
        mails: {refType: Rest.Model.MailTypeRef, ...mappingItem()},
        folders: {refType: Rest.Model.MailFolderTypeRef, ...mappingItem()},
        contacts: {refType: Rest.Model.ContactTypeRef, ...mappingItem()},
    };
    const mappingKeys = Object.keys(mapping) as Array<keyof typeof mapping>;

    for (const {events} of input.eventBatches) {
        for (const event of events) {
            for (const key of mappingKeys) {
                const {refType, updatesMappedByInstanceId} = mapping[key];
                if (!Rest.Util.sameRefType(refType, event)) {
                    continue;
                }
                updatesMappedByInstanceId.set(
                    event.instanceId,
                    [...(updatesMappedByInstanceId.get(event.instanceId) || []), event],
                );
            }
        }
    }

    logger.verbose([
        `resolved unique entities to process history chain:`,
        mappingKeys.map((key) => `${key}: ${mapping[key].updatesMappedByInstanceId.size}`).join("; "),
    ].join(" "));

    for (const key of mappingKeys) {
        const {updatesMappedByInstanceId, idsMappedByListId, remove} = mapping[key];
        for (const entityUpdates of updatesMappedByInstanceId.values()) {
            let added = false;
            // entity updates sorted in ASC order, so reversing the entity updates list in order to start processing from the newest items
            for (const update of entityUpdates.reverse()) {
                if (!added && isUpsertOperationType(update.operation)) {
                    idsMappedByListId.set(
                        update.instanceListId,
                        [...(idsMappedByListId.get(update.instanceListId) || []), update.instanceId],
                    );
                    added = true;
                }
                if (update.operation === DatabaseModel.OPERATION_TYPE.DELETE) {
                    remove.push({pk: Database.buildPk([update.instanceListId, update.instanceId])});
                    break;
                }
            }
        }
    }

    const patch: DbPatch = {
        conversationEntries: {remove: mapping.conversationEntries.remove, upsert: []},
        mails: {remove: mapping.mails.remove, upsert: []},
        folders: {remove: mapping.folders.remove, upsert: []},
        contacts: {remove: mapping.contacts.remove, upsert: []},
    };

    if (!nullUpsert) {
        for (const [listId, instanceIds] of mapping.conversationEntries.idsMappedByListId.entries()) {
            const entities = await fetchMultipleEntities(mapping.conversationEntries.refType, listId, instanceIds);
            for (const entity of entities) {
                patch.conversationEntries.upsert.push(Database.buildConversationEntry(entity));
            }
        }
        for (const [listId, instanceIds] of mapping.mails.idsMappedByListId.entries()) {
            const entities = await fetchMultipleEntities(mapping.mails.refType, listId, instanceIds);
            patch.mails.upsert.push(...await Database.buildMails(entities));
        }
        for (const [listId, instanceIds] of mapping.folders.idsMappedByListId.entries()) {
            const entities = await fetchMultipleEntities(mapping.folders.refType, listId, instanceIds);
            for (const entity of entities) {
                patch.folders.upsert.push(Database.buildFolder(entity));
            }
        }
        for (const [listId, instanceIds] of mapping.contacts.idsMappedByListId.entries()) {
            const entities = await fetchMultipleEntities(mapping.contacts.refType, listId, instanceIds);
            for (const entity of entities) {
                patch.contacts.upsert.push(Database.buildContact(entity));
            }
        }
    } else {
        // we only need the data structure to be formed at this point, so no need to perform the actual fetching
        for (const key of mappingKeys) {
            for (const instanceIds of mapping[key].idsMappedByListId.values()) {
                instanceIds.map(() => {
                    (patch[key].upsert as any[]).push(null);
                });
            }
        }
    }

    logger.verbose([
        `upsert/remove:`,
        mappingKeys.map((key) => `${key}: ${patch[key].upsert.length}/${patch[key].remove.length}`).join("; "),
    ].join(" "));

    return patch;
}

function getUserController(): { accessToken: string, user: Rest.Model.User } | null {
    return WINDOW.tutao
    && WINDOW.tutao.logins
    && typeof WINDOW.tutao.logins.getUserController === "function"
    && WINDOW.tutao.logins.getUserController() ? WINDOW.tutao.logins.getUserController()
        : null;
}

function isLoggedIn(): boolean {
    const controller = getUserController();
    return !!(controller
        && controller.accessToken
        && controller.accessToken.length
    );
}
