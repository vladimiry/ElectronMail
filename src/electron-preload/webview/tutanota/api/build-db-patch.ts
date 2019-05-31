import {catchError} from "rxjs/operators";
import {defer, from} from "rxjs";

import * as Database from "src/electron-preload/webview/tutanota/lib/database";
import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "src/electron-preload/webview/tutanota/lib/rest";
import {DEFAULT_MESSAGES_STORE_PORTION_SIZE} from "src/shared/constants";
import {DbPatch} from "src/shared/api/common";
import {MemoryDbAccount} from "src/shared/model/database";
import {Omit} from "src/shared/types";
import {StatusCodeError} from "src/shared/model/error";
import {TutanotaApi, TutanotaScanApi} from "src/shared/api/webview/tutanota";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {buildDbPatchRetryPipeline, buildEmptyDbPatch, persistDatabasePatch, resolveIpcMainApi} from "src/electron-preload/webview/util";
import {buildLoggerBundle} from "src/electron-preload/util";
import {curryFunctionMembers, isDatabaseBootstrapped} from "src/shared/util";
import {getUserController, isLoggedIn, isUpsertUpdate, preprocessError} from "src/electron-preload/webview/tutanota/lib/util";
import {resolveProviderApi} from "src/electron-preload/webview/tutanota/lib/provider-api";

interface DbPatchBundle {
    patch: DbPatch;
    metadata: Omit<MemoryDbAccount<"tutanota">["metadata"], "type">;
}

type BuildDbPatchMethodReturnType = TutanotaScanApi["ApiImplReturns"]["buildDbPatch"];

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, "[api/build-db-patch]");

const buildDbPatchEndpoint: Pick<TutanotaApi, "buildDbPatch"> = {
    buildDbPatch(input) {
        const logger = curryFunctionMembers(_logger, "buildDbPatch()", input.zoneName);

        logger.info();

        const deferFactory: () => Promise<BuildDbPatchMethodReturnType> = async () => {
            logger.info("delayFactory()");

            const controller = getUserController();
            const inputMetadata = input.metadata;

            if (!controller || !isLoggedIn()) {
                throw new Error("tutanota:buildDbPatch(): user is supposed to be logged-in");
            }

            if (!isDatabaseBootstrapped(inputMetadata)) {
                await bootstrapDbPatch(
                    logger,
                    async (dbPatch) => {
                        await persistDatabasePatch(
                            {
                                ...dbPatch,
                                type: input.type,
                                login: input.login,
                            },
                            logger,
                            {immediateWrite: true},
                        );
                    },
                );

                return;
            }

            const preFetch = await (async (
                inputGroupEntityEventBatchIds: DbPatchBundle["metadata"]["groupEntityEventBatchIds"],
            ) => {
                const fetchedEventBatches: Rest.Model.EntityEventBatch[] = [];
                const memberships = Rest.Util.filterSyncingMemberships(controller.user);
                const {groupEntityEventBatchIds}: DbPatchBundle["metadata"] = {groupEntityEventBatchIds: {}};
                logger.verbose(`start fetching entity event batches of ${memberships.length} memberships`);
                for (const {group} of memberships) {
                    const startId = await Rest.Util.generateStartId(inputGroupEntityEventBatchIds[group]);
                    const entityEventBatches: Rest.Model.EntityEventBatch[] = [];
                    await Rest.fetchEntitiesRangeUntilTheEnd(
                        Rest.Model.EntityEventBatchTypeRef, group, {start: startId, count: 100}, async (fetched) => {
                            entityEventBatches.push(...fetched);
                        },
                    );
                    fetchedEventBatches.push(...entityEventBatches);
                    if (entityEventBatches.length) {
                        groupEntityEventBatchIds[group] = Rest.Util.resolveInstanceId(entityEventBatches[entityEventBatches.length - 1]);
                    }
                }
                logger.verbose(
                    `fetched ${fetchedEventBatches.length} entity event batches from ${memberships.length} memberships`,
                );
                return {
                    missedEventBatches: fetchedEventBatches,
                    metadata: {groupEntityEventBatchIds},
                };
            })(inputMetadata.groupEntityEventBatchIds);
            const metadata: DbPatchBundle["metadata"] = preFetch.metadata;
            const patch = await buildDbPatch({eventBatches: preFetch.missedEventBatches, parentLogger: logger});

            await persistDatabasePatch(
                {
                    patch,
                    metadata,
                    type: input.type,
                    login: input.login,
                },
                logger,
                {immediateWrite: false},
            );

            return;
        };

        return defer(deferFactory).pipe(
            buildDbPatchRetryPipeline<BuildDbPatchMethodReturnType>(preprocessError, _logger),
            catchError((error) => {
                if (StatusCodeError.hasStatusCodeValue(error, "SkipDbPatch")) {
                    return from(Promise.resolve());
                }
                throw error;
            }),
        );
    },
};

async function bootstrapDbPatch(
    parentLogger: ReturnType<typeof buildLoggerBundle>,
    triggerStoreCallback: (path: DbPatchBundle) => Promise<void>,
): Promise<void> {
    const logger = curryFunctionMembers(parentLogger, "bootstrapDbPatch()");
    const api = await resolveProviderApi();
    const controller = getUserController();

    if (!controller) {
        throw new Error("User controller is supposed to be defined");
    }

    // last entity event batches fetching must be happening before entities fetching
    const {metadata} = await (async () => {
        const {GENERATED_MAX_ID} = api["src/api/common/EntityFunctions"];
        const {groupEntityEventBatchIds}: DbPatchBundle["metadata"] = {groupEntityEventBatchIds: {}};
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

    logger.verbose("start fetching contacts");
    const contacts = await (async () => {
        const {group} = controller.user.userGroup;
        const contactList = await api["src/api/main/Entity"].loadRoot(Rest.Model.ContactListTypeRef, group);
        return await Rest.fetchAllEntities(Rest.Model.ContactTypeRef, contactList.contacts);
    })();
    logger.info(`fetched ${contacts.length} contacts`);

    logger.verbose(`start fetching folders`);
    const folders = await Rest.Util.fetchMailFoldersWithSubFolders(controller.user);
    logger.info(`fetched ${folders.length} folders`);

    logger.verbose(`construct initial database patch`);
    const initialPatch = buildEmptyDbPatch();
    initialPatch.folders.upsert = folders.map(Database.buildFolder);
    initialPatch.contacts.upsert = contacts.map(Database.buildContact);

    logger.verbose(`trigger initial storing`);
    await triggerStoreCallback({
        patch: initialPatch,
        metadata: {
            // WARN: don't persist the "latestEventId" value yet as this is intermediate storing
            groupEntityEventBatchIds: {},
        },
    });

    const remainingMails: Rest.Model.Mail[] = await (async () => {
        const {fetching: {messagesStorePortionSize = DEFAULT_MESSAGES_STORE_PORTION_SIZE}}
            = await (await resolveIpcMainApi(logger))("readConfig")();
        const fetchParams = {start: await Rest.Util.generateStartId(), count: 100, reverse: false};

        let mailsPersistencePortion: Rest.Model.Mail[] = [];
        let mailsFetched = 0;

        for (const folder of folders) {
            await Rest.fetchEntitiesRangeUntilTheEnd(Rest.Model.MailTypeRef, folder.mails, fetchParams, async (mails) => {
                mailsFetched += mails.length;
                logger.verbose(`mails fetch progress: ${mailsFetched}`);

                mailsPersistencePortion.push(...mails);

                const flushThePortion = mailsPersistencePortion.length >= messagesStorePortionSize;

                if (!flushThePortion) {
                    return;
                }

                const intermediatePatch = await buildMailsAndConversationEntriesDbPatch(mailsPersistencePortion, logger);

                // TODO define "mailsPersistencePortion" array as a constant and reset it then like "mailsPersistencePortion.length = 0"
                mailsPersistencePortion = [];

                logger.verbose([
                    `trigger intermediate storing,`,
                    `mails: ${intermediatePatch.mails.upsert.length},`,
                    `conversationEntries: ${intermediatePatch.conversationEntries.upsert.length}`,
                ].join(" "));

                await triggerStoreCallback({
                    patch: intermediatePatch,
                    metadata: {
                        // WARN: don't persist the "latestEventId" value yet as this is intermediate storing
                        groupEntityEventBatchIds: {},
                    },
                });
            });
        }

        logger.info(`fetched ${mailsFetched} messages`);

        return mailsPersistencePortion;
    })();

    const finalPatch = await buildMailsAndConversationEntriesDbPatch(remainingMails, logger);

    logger.verbose([
        `trigger final storing,`,
        `mails: ${finalPatch.mails.upsert.length},`,
        `conversationEntries: ${finalPatch.conversationEntries.upsert.length}`,
    ].join(" "));

    await triggerStoreCallback({
        patch: finalPatch,
        metadata,
    });
}

async function buildMailsAndConversationEntriesDbPatch(
    mails: Rest.Model.Mail[],
    logger: ReturnType<typeof buildLoggerBundle>,
): Promise<DbPatch> {
    const conversationEntries = await fetchConversationEntries(mails, logger);
    const patch = buildEmptyDbPatch();

    patch.mails.upsert = await Database.buildMails(mails);
    patch.conversationEntries.upsert = conversationEntries.map(Database.buildConversationEntry);

    return patch;
}

async function fetchConversationEntries(
    mails: Rest.Model.Mail[],
    logger: ReturnType<typeof buildLoggerBundle>,
): Promise<Rest.Model.ConversationEntry[]> {
    const items: Rest.Model.ConversationEntry[] = [];
    const conversationEntryListIds = mails.reduce(
        (accumulator, mail) => {
            accumulator.add(Rest.Util.resolveListId({_id: mail.conversationEntry}));
            return accumulator;
        },
        new Set<Rest.Model.ConversationEntry["_id"][0]>(),
    );

    // TODO figure how to load all the entities in a single/few requests having only the array of "listId" values
    logger.verbose(`start fetching conversation entries, iterations count: ${conversationEntryListIds.size}`);
    for (const listId of conversationEntryListIds.values()) {
        const fetched = await Rest.fetchAllEntities(Rest.Model.ConversationEntryTypeRef, listId);
        items.push(...fetched);
        logger.verbose(`conversation entries fetch progress: ${fetched.length}`);
    }

    return items;
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

export {
    buildDbPatchEndpoint,
    buildDbPatch,
};
