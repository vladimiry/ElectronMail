import {EMPTY, Observable, defer, from, interval, merge, of} from "rxjs";
import {authenticator} from "otplib";
import {buffer, catchError, concatMap, debounceTime, distinctUntilChanged, map, tap} from "rxjs/operators";
import {pick} from "ramda";

import * as Database from "./lib/database";
import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "./lib/rest";
import {DbPatch} from "src/shared/api/common";
import {MAIL_FOLDER_TYPE, MemoryDbAccount} from "src/shared/model/database";
import {
    NOTIFICATION_LOGGED_IN_POLLING_INTERVAL,
    NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL,
    WEBVIEW_LOGGERS,
} from "src/electron-preload/webview/constants";
import {ONE_SECOND_MS} from "src/shared/constants";
import {Omit, Unpacked} from "src/shared/types";
import {StatusCodeError} from "src/shared/model/error";
import {TUTANOTA_IPC_WEBVIEW_API, TutanotaApi, TutanotaNotificationOutput} from "src/shared/api/webview/tutanota";
import {
    buildDbPatchRetryPipeline,
    fillInputValue,
    getLocationHref,
    persistDatabasePatch,
    resolveDomElements,
    submitTotpToken,
} from "src/electron-preload/webview/util";
import {buildLoggerBundle} from "src/electron-preload/util";
import {curryFunctionMembers, isEntityUpdatesPatchNotEmpty} from "src/shared/util";
import {isUpsertOperationType, preprocessError} from "./lib/util";
import {resolveProviderApi} from "src/electron-preload/webview/tutanota/lib/provider-api";

interface BuildDbPatchReturn {
    patch: DbPatch;
    metadata: Omit<MemoryDbAccount<"tutanota">["metadata"], "type">;
}

type BuildDbPatchInputMetadata = BuildDbPatchReturn["metadata"];

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, "[api]");

export async function registerApi(): Promise<void> {
    return resolveProviderApi()
        .then(bootstrapEndpoints)
        .then((endpoints) => {
            TUTANOTA_IPC_WEBVIEW_API.registerApi(endpoints, {logger: {error: _logger.error, info: () => {}}});
        });
}

function bootstrapEndpoints(api: Unpacked<ReturnType<typeof resolveProviderApi>>): TutanotaApi {
    const {GENERATED_MAX_ID} = api["src/api/common/EntityFunctions"];
    const login2FaWaitElementsConfig = {
        input: () => document.querySelector("#modal input.input") as HTMLInputElement,
        button: () => document.querySelector("#modal .flex-half.justify-end > button") as HTMLElement,
    };
    const endpoints: TutanotaApi = {
        ping: () => of(null),

        buildDbPatch: (input) => defer(() => (async (logger = curryFunctionMembers(_logger, "api:buildDbPatch()", input.zoneName)) => {
            const controller = getUserController();

            if (!controller || !isLoggedIn()) {
                throw new Error("tutanota:buildDbPatch(): user is supposed to be logged-in");
            }

            if (!input.metadata || !Object.keys(input.metadata.groupEntityEventBatchIds || {}).length) {
                return await persistDatabasePatch(
                    {
                        ...await bootstrapDbPatch({api}, logger),
                        type: input.type,
                        login: input.login,
                    },
                    logger,
                );
            }

            const preFetch = await (async (
                inputGroupEntityEventBatchIds: BuildDbPatchInputMetadata["groupEntityEventBatchIds"],
                fetchedEventBatches: Rest.Model.EntityEventBatch[] = [],
                memberships = Rest.Util.filterSyncingMemberships(controller.user),
            ) => {
                const {groupEntityEventBatchIds}: BuildDbPatchInputMetadata = {groupEntityEventBatchIds: {}};
                for (const {group} of memberships) {
                    const startId = await Rest.Util.generateStartId(inputGroupEntityEventBatchIds[group]);
                    const fetched = await Rest.fetchEntitiesRangeUntilTheEnd(
                        Rest.Model.EntityEventBatchTypeRef, group, {start: startId, count: 500},
                    );
                    fetchedEventBatches.push(...fetched);
                    if (fetched.length) {
                        groupEntityEventBatchIds[group] = Rest.Util.resolveInstanceId(fetched[fetched.length - 1]);
                    }
                }
                logger.verbose(
                    `fetched ${fetchedEventBatches.length} entity event batches from ${memberships.length} memberships`,
                );
                return {
                    missedEventBatches: fetchedEventBatches,
                    metadata: {groupEntityEventBatchIds},
                };
            })(input.metadata.groupEntityEventBatchIds);
            const metadata: BuildDbPatchReturn["metadata"] = preFetch.metadata;
            const patch = await buildDbPatch({eventBatches: preFetch.missedEventBatches, parentLogger: logger});

            return await persistDatabasePatch(
                {
                    patch,
                    metadata,
                    type: input.type,
                    login: input.login,
                },
                logger,
            );
        })()).pipe(
            buildDbPatchRetryPipeline<Unpacked<ReturnType<TutanotaApi["buildDbPatch"]>>>(preprocessError, _logger),
            catchError((error) => {
                if (StatusCodeError.hasStatusCodeValue(error, "SkipDbPatch")) {
                    return of(null);
                }
                throw error;
            }),
        ),

        fillLogin: ({login, zoneName}) => from((async (logger = curryFunctionMembers(_logger, "api:fillLogin()", zoneName)) => {
            logger.info();

            const cancelEvenHandler = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
            };
            const elements = await resolveDomElements({
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

            const elements = await resolveDomElements({
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

            const elements = await resolveDomElements(login2FaWaitElementsConfig);
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
                                twoFactorElements = await resolveDomElements(login2FaWaitElementsConfig, {iterationsLimit: 1});
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
                new Observable<UnreadOutput>((subscriber) => {
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

                        const emails = await Rest.fetchEntitiesRange(
                            Rest.Model.MailTypeRef,
                            inboxFolder.mails,
                            {count: 50, reverse: true, start: GENERATED_MAX_ID},
                        );
                        const unread = emails.reduce((sum, mail) => sum + Number(mail.unread), 0);

                        subscriber.next({unread});
                    };

                    setInterval(notifyUnreadValue, ONE_SECOND_MS * 60);
                    setTimeout(notifyUnreadValue, ONE_SECOND_MS * 15);
                }).pipe(
                    // all the values need to be sent to stream to get proper unread value after disabling database syncing
                    // distinctUntilChanged(({unread: prev}, {unread: curr}) => curr === prev),
                ),

                (() => {
                    const innerLogger = curryFunctionMembers(logger, `[entity update notification]`);
                    const notification = {batchEntityUpdatesCounter: 0};
                    const notificationReceived$ = new Observable<Pick<Rest.Model.EntityEventBatch, "events">>((
                        notificationReceivedSubscriber,
                    ) => {
                        const {EntityEventController} = api["src/api/main/EntityEventController"];
                        EntityEventController.prototype.notificationReceived = ((
                            original = EntityEventController.prototype.notificationReceived,
                        ) => {
                            const overridden: typeof EntityEventController.prototype.notificationReceived = function(
                                this: typeof EntityEventController,
                                entityUpdates,
                                // tslint:disable-next-line:trailing-comma
                                ...rest
                            ) {
                                entityUpdates
                                    .map((entityUpdate) => pick(["application", "type", "operation"], entityUpdate))
                                    .forEach((entityUpdate) => innerLogger.debug(JSON.stringify(entityUpdate)));
                                notificationReceivedSubscriber.next({events: entityUpdates});
                                return original.call(this, entityUpdates, ...rest);
                            };
                            return overridden;
                        })();
                    });

                    return notificationReceived$.pipe(
                        buffer(notificationReceived$.pipe(
                            debounceTime(ONE_SECOND_MS * 1.5),
                        )),
                        concatMap((eventBatches) => from(buildDbPatch({eventBatches, parentLogger: innerLogger}, true))),
                        concatMap((patch) => {
                            if (!isEntityUpdatesPatchNotEmpty(patch)) {
                                return EMPTY;
                            }
                            for (const key of (Object.keys(patch) as Array<keyof typeof patch>)) {
                                innerLogger.info(`upsert/remove ${key}: ${patch[key].upsert.length}/${patch[key].remove.length}`);
                            }
                            notification.batchEntityUpdatesCounter++;
                            return [notification];
                        }),
                    );
                })(),
            ];

            return merge(...observables);
        },
    };

    return endpoints;
}

async function bootstrapDbPatch(
    {api}: { api: Unpacked<ReturnType<typeof resolveProviderApi>> },
    parentLogger: ReturnType<typeof buildLoggerBundle>,
): Promise<BuildDbPatchReturn> {
    const logger = curryFunctionMembers(parentLogger, "bootstrapDbPatch()");
    const controller = getUserController();

    if (!controller) {
        throw new Error("User controller is supposed to be defined");
    }

    // last entity event batches fetching must be happening before entities fetching
    const {metadata} = await (async () => {
        const {GENERATED_MAX_ID} = api["src/api/common/EntityFunctions"];
        const {groupEntityEventBatchIds}: BuildDbPatchInputMetadata = {groupEntityEventBatchIds: {}};
        const memberships = Rest.Util.filterSyncingMemberships(controller.user);
        for (const {group} of memberships) {
            const entityEventBatches = await Rest.fetchEntitiesRange(
                Rest.Model.EntityEventBatchTypeRef,
                group,
                {count: 1, reverse: true, start: GENERATED_MAX_ID},
            );
            if (entityEventBatches.length) {
                groupEntityEventBatchIds[group] = Rest.Util.resolveInstanceId(entityEventBatches[0]);
            }
        }
        logger.info([
            `fetched ${Object.keys(groupEntityEventBatchIds).length} "groupEntityEventBatchIds" metadata properties`,
            `from ${memberships.length} memberships`,
        ].join(" "));
        return {metadata: {groupEntityEventBatchIds}};
    })();
    const rangeFetchParams = {start: await Rest.Util.generateStartId(), count: 100};
    const folders = await Rest.Util.fetchMailFoldersWithSubFolders(controller.user);
    const mails = await (async (items: Rest.Model.Mail[] = []) => {
        for (const folder of folders) {
            const fetched = await Rest.fetchEntitiesRangeUntilTheEnd(Rest.Model.MailTypeRef, folder.mails, rangeFetchParams);
            items.push(...fetched);
        }
        return items;
    })();
    const conversationEntries = await (async (items: Rest.Model.ConversationEntry[] = []) => {
        const conversationEntryListIds = mails.reduce(
            (accumulator, mail) => {
                accumulator.add(Rest.Util.resolveListId({_id: mail.conversationEntry}));
                return accumulator;
            },
            new Set<Rest.Model.ConversationEntry["_id"][0]>(),
        );
        for (const listId of conversationEntryListIds.values()) {
            const fetched = await Rest.fetchAllEntities(Rest.Model.ConversationEntryTypeRef, listId);
            items.push(...fetched);
        }
        return items;
    })();
    const contacts = await (async () => {
        const {group} = controller.user.userGroup;
        const contactList = await api["src/api/main/Entity"].loadRoot(Rest.Model.ContactListTypeRef, group);
        return await Rest.fetchAllEntities(Rest.Model.ContactTypeRef, contactList.contacts);
    })();

    const patch: DbPatch = {
        conversationEntries: {remove: [], upsert: conversationEntries.map(Database.buildConversationEntry)},
        mails: {remove: [], upsert: await Database.buildMails(mails)},
        folders: {remove: [], upsert: folders.map(Database.buildFolder)},
        contacts: {remove: [], upsert: contacts.map(Database.buildContact)},
    };

    return {
        patch,
        metadata,
    };
}

async function buildDbPatch(
    input: {
        eventBatches: Array<Pick<Rest.Model.EntityEventBatch, "events">>;
        parentLogger: ReturnType<typeof buildLoggerBundle>;
    },
    nullUpsert: boolean = false,
): Promise<DbPatch> {
    const logger = curryFunctionMembers(input.parentLogger, "buildDbPatch()");
    const mappingItem = () => ({updatesMappedByInstanceId: new Map(), remove: [], upsertIds: new Map()});
    const mapping: Record<"conversationEntries" | "mails" | "folders" | "contacts", {
        updatesMappedByInstanceId: Map<Rest.Model.Id, Rest.Model.EntityUpdate[]>;
        remove: Array<{ pk: string }>;
        upsertIds: Map<Rest.Model.Id, Rest.Model.Id[]>; // list.id => instance.id[]
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
                updatesMappedByInstanceId.set(event.instanceId, (updatesMappedByInstanceId.get(event.instanceId) || []).concat(event));
            }
        }
    }

    logger.verbose([
        `resolved unique entities to process history chain:`,
        mappingKeys.map((key) => `${key}: ${mapping[key].updatesMappedByInstanceId.size}`).join("; "),
    ].join(" "));

    for (const key of mappingKeys) {
        const {updatesMappedByInstanceId, upsertIds, remove} = mapping[key];
        for (const entityUpdates of updatesMappedByInstanceId.values()) {
            let upserted = false;
            // entity updates sorted in ASC order, so reversing the entity updates list in order to start processing from the newest items
            for (const update of entityUpdates.reverse()) {
                if (!upserted && isUpsertUpdate(update)) {
                    upsertIds.set(update.instanceListId, (upsertIds.get(update.instanceListId) || []).concat(update.instanceId));
                    upserted = true;
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
        // TODO process 404 error of fetching individual entity
        // so we could catch the individual entity fetching error
        // 404 error can be ignored as if it occurs because user was moved stuff from here to there while syncing cycle was in progress
        // in order to handle the case there will be a need to switch back to the per entity fetch requests
        for (const [listId, instanceIds] of mapping.conversationEntries.upsertIds.entries()) {
            const entities = await Rest.fetchMultipleEntities(mapping.conversationEntries.refType, listId, instanceIds);
            for (const entity of entities) {
                patch.conversationEntries.upsert.push(Database.buildConversationEntry(entity));
            }
        }
        for (const [listId, instanceIds] of mapping.mails.upsertIds.entries()) {
            const entities = await Rest.fetchMultipleEntities(mapping.mails.refType, listId, instanceIds);
            patch.mails.upsert.push(...await Database.buildMails(entities));
        }
        for (const [listId, instanceIds] of mapping.folders.upsertIds.entries()) {
            const entities = await Rest.fetchMultipleEntities(mapping.folders.refType, listId, instanceIds);
            for (const entity of entities) {
                patch.folders.upsert.push(Database.buildFolder(entity));
            }
        }
        for (const [listId, instanceIds] of mapping.contacts.upsertIds.entries()) {
            const entities = await Rest.fetchMultipleEntities(mapping.contacts.refType, listId, instanceIds);
            for (const entity of entities) {
                patch.contacts.upsert.push(Database.buildContact(entity));
            }
        }
    } else {
        // we only need the data structure to be formed at this point, so no need to perform the actual fetching
        for (const key of mappingKeys) {
            for (const instanceIds of mapping[key].upsertIds.values()) {
                instanceIds.forEach(() => {
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
    const WINDOW = window as any; // TODO remove "as any" casting on https://github.com/Microsoft/TypeScript/issues/14701 resolving
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

function isUpsertUpdate(update: Rest.Model.EntityUpdate) {
    return isUpsertOperationType(update.operation);
}
