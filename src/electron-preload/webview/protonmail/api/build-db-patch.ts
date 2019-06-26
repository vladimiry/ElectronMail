import {catchError} from "rxjs/operators";
import {defer, from} from "rxjs";

import * as Database from "src/electron-preload/webview/protonmail/lib/database";
import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "src/electron-preload/webview/protonmail/lib/rest";
import {AJAX_SEND_NOTIFICATION_SKIP_PARAM} from "src/electron-preload/webview/protonmail/notifications";
import {DEFAULT_MESSAGES_STORE_PORTION_SIZE, ONE_SECOND_MS} from "src/shared/constants";
import {DbPatch} from "src/shared/api/common";
import {FsDbAccount} from "src/shared/model/database";
import {ProtonmailApi, ProtonmailApiScan} from "src/shared/api/webview/protonmail";
import {ProviderApi, resolveProviderApi} from "src/electron-preload/webview/protonmail/lib/provider-api";
import {StatusCodeError} from "src/shared/model/error";
import {UPSERT_EVENT_ACTIONS} from "src/electron-preload/webview/protonmail/lib/rest/model";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {asyncDelay, curryFunctionMembers, isDatabaseBootstrapped} from "src/shared/util";
import {buildDbPatchRetryPipeline, buildEmptyDbPatch, persistDatabasePatch, resolveIpcMainApi} from "src/electron-preload/webview/util";
import {buildLoggerBundle} from "src/electron-preload/util";
import {isLoggedIn, isUpsertOperationType, preprocessError} from "src/electron-preload/webview/protonmail/lib/util";

interface DbPatchBundle {
    patch: DbPatch;
    metadata: Omit<FsDbAccount<"protonmail">["metadata"], "type">;
}

type BuildDbPatchMethodReturnType = ProtonmailApiScan["ApiImplReturns"]["buildDbPatch"];

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.protonmail, "[api/build-db-patch]");

const buildDbPatchEndpoint: Pick<ProtonmailApi, "buildDbPatch" | "fetchSingleMail"> = {
    buildDbPatch(input) {
        const logger = curryFunctionMembers(_logger, "buildDbPatch()", input.zoneName);

        logger.info();

        const deferFactory: () => Promise<BuildDbPatchMethodReturnType> = async () => {
            logger.info("delayFactory()");

            if (!isLoggedIn()) {
                // TODO handle switching from built-in webclient to remote and back more properly
                // the account state keeps the "signed-in" state despite of page still being reloded
                // so we need to reset "signed-in" state with "account.entryUrl" value change
                await asyncDelay(ONE_SECOND_MS * 5);

                if (!isLoggedIn()) {
                    throw new Error("protonmail:buildDbPatch(): user is supposed to be logged-in");
                }
            }

            const inputMetadata = input.metadata;

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
                        );
                    },
                );

                return;
            }

            const preFetch = await (async (
                {events}: ProviderApi,
                id: Rest.Model.Event["EventID"],
            ) => {
                const fetchedEvents: Rest.Model.Event[] = [];

                do {
                    const response = await events.get(id, {params: {[AJAX_SEND_NOTIFICATION_SKIP_PARAM]: ""}});
                    const hasMoreEvents = response.More === 1;
                    const sameNextId = id === response.EventID;

                    fetchedEvents.push(response);
                    id = response.EventID;

                    if (!hasMoreEvents) {
                        break;
                    }
                    if (!sameNextId) {
                        continue;
                    }

                    throw new Error(
                        `Events API indicates that there is a next event in the queue but responded with the same "next event id"`,
                    );
                } while (true);

                logger.info(`fetched ${fetchedEvents.length} missed events`);

                return {
                    latestEventId: id,
                    missedEvents: fetchedEvents,
                };
            })(
                await resolveProviderApi(),
                inputMetadata.latestEventId,
            );

            const metadata: DbPatchBundle["metadata"] = {latestEventId: preFetch.latestEventId};
            const patch = await buildDbPatch({events: preFetch.missedEvents, parentLogger: logger});

            await persistDatabasePatch(
                {
                    patch,
                    metadata,
                    type: input.type,
                    login: input.login,
                },
                logger,
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

    async fetchSingleMail(input) {
        const logger = curryFunctionMembers(_logger, "fetchSingleMail()", input.zoneName);

        logger.info();

        const [anyUpsertAction] = UPSERT_EVENT_ACTIONS;
        const data: DbPatchBundle = {
            patch: await buildDbPatch({
                events: [
                    {
                        Messages: [{ID: input.mailPk, Action: anyUpsertAction}],
                    },
                ],
                parentLogger: logger,
            }),
            metadata: {
                // WARN: don't persist the "latestEventId" value in the case of single mail saving
                latestEventId: "",
            },
        };

        await persistDatabasePatch(
            {
                ...data,
                type: input.type,
                login: input.login,
            },
            logger,
        );
    },
};

async function bootstrapDbPatch(
    parentLogger: ReturnType<typeof buildLoggerBundle>,
    triggerStoreCallback: (path: DbPatchBundle) => Promise<void>,
): Promise<void> {
    const logger = curryFunctionMembers(parentLogger, "bootstrapDbPatch()");
    const api = await resolveProviderApi();
    // WARN: "getLatestID" should be called on top of the function, ie before any other fetching
    // so app is able to get any potentially missed changes happened during this function execution
    const latestEventId = await api.events.getLatestID();

    if (!latestEventId) {
        throw new Error(`"getLatestID" call returned empty value`);
    }

    // WARN: "labels" need to be stored first of all to allow "database expolrer UI" show the intermediate data
    // so we include "labels/contacts" to the initial database patch

    logger.verbose("start fetching contacts");
    const contacts = await (async () => {
        const items = await api.contact.all();
        const result: Rest.Model.Contact[] = [];
        for (const item of items) {
            result.push(await api.contact.get(item.ID));
        }
        return result;
    })();
    logger.info(`fetched ${contacts.length} contacts`);

    logger.verbose(`start fetching folders`);
    const folders = await api.label.query({Type: Rest.Model.LABEL_TYPE.MESSAGE}); // fetching all the entities;
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
            latestEventId: "",
        },
    });

    logger.verbose("start fetching messages");
    const remainingMails: DatabaseModel.Mail[] = await (async () => {
        const conversationsQuery = {Page: 0, PageSize: 150};
        const {fetching: {messagesStorePortionSize = DEFAULT_MESSAGES_STORE_PORTION_SIZE}}
            = await (await resolveIpcMainApi(logger))("readConfig")();

        logger.info(JSON.stringify({messagesStorePortionSize}));

        let conversationsFetchResponse: Unpacked<ReturnType<typeof api.conversation.query>> | undefined;
        let mailsPersistencePortion: DatabaseModel.Mail[] = [];
        let conversationsFetched = 0;
        let mailsFetched = 0;

        logger.verbose("start fetching conversations");
        while (!conversationsFetchResponse || conversationsFetchResponse.data.Conversations.length) {
            conversationsFetchResponse = await api.conversation.query(conversationsQuery);
            const conversations = conversationsFetchResponse.data.Conversations;

            conversationsFetched += conversations.length;
            logger.verbose(`conversations fetch progress: ${conversationsFetched}`);

            for (const conversation of conversations) {
                const dbMails = await buildConversationDbMails(conversation, api);

                mailsFetched += dbMails.length;
                logger.verbose(`mails fetch progress: ${mailsFetched}`);

                mailsPersistencePortion.push(...dbMails);

                const flushThePortion = mailsPersistencePortion.length >= messagesStorePortionSize;

                if (!flushThePortion) {
                    continue;
                }

                const intermediatePatch = buildEmptyDbPatch();

                intermediatePatch.mails.upsert = mailsPersistencePortion;
                mailsPersistencePortion = [];

                logger.verbose([
                    `trigger intermediate storing,`,
                    `mails: ${intermediatePatch.mails.upsert.length},`,
                ].join(" "));
                await triggerStoreCallback({
                    patch: intermediatePatch,
                    metadata: {
                        // WARN: don't persist the "latestEventId" value yet as this is intermediate storing
                        latestEventId: "",
                    },
                });
            }

            conversationsQuery.Page++;
        }
        logger.info(`fetched ${conversationsFetched} conversations`);
        logger.info(`fetched ${mailsFetched} messages`);

        return mailsPersistencePortion;
    })();

    const finalPatch = buildEmptyDbPatch();
    finalPatch.mails.upsert = remainingMails;

    logger.verbose([
        `trigger final storing,`,
        `mails: ${finalPatch.mails.upsert.length},`,
    ].join(" "));

    await triggerStoreCallback({
        patch: finalPatch,
        metadata: {latestEventId},
    });
}

async function buildConversationDbMails(briefConversation: Rest.Model.Conversation, api: ProviderApi): Promise<DatabaseModel.Mail[]> {
    const result: DatabaseModel.Mail[] = [];
    const conversationFetchResponse = await api.conversation.get(briefConversation.ID);
    const conversationMessages = conversationFetchResponse.data.Messages;

    for (const mail of conversationMessages) {
        if (mail.Body) {
            result.push(await Database.buildMail(mail, api));
            continue;
        }
        const mailFetchResponse = await api.message.get(mail.ID);
        result.push(await Database.buildMail(mailFetchResponse.data.Message, api));
    }

    return result;
}

async function buildDbPatch(
    input: {
        events: Array<Pick<Rest.Model.Event, "Messages" | "Labels" | "Contacts">>;
        parentLogger: ReturnType<typeof buildLoggerBundle>;
    },
    nullUpsert: boolean = false,
): Promise<DbPatch> {
    const api = await resolveProviderApi();
    const logger = curryFunctionMembers(input.parentLogger, "buildDbPatch()");
    const mappingItem = () => ({updatesMappedByInstanceId: new Map(), remove: [], upsertIds: []});
    const mapping: Record<"mails" | "folders" | "contacts", {
        remove: Array<{ pk: string }>;
        upsertIds: Rest.Model.Id[];
    }> & {
        mails: {
            refType: keyof Pick<Rest.Model.Event, "Messages">;
            updatesMappedByInstanceId: Map<Rest.Model.Id, Array<Unpacked<Required<Rest.Model.Event>["Messages"]>>>;
        },
        folders: {
            refType: keyof Pick<Rest.Model.Event, "Labels">;
            updatesMappedByInstanceId: Map<Rest.Model.Id, Array<Unpacked<Required<Rest.Model.Event>["Labels"]>>>;
        },
        contacts: {
            refType: keyof Pick<Rest.Model.Event, "Contacts">;
            updatesMappedByInstanceId: Map<Rest.Model.Id, Array<Unpacked<Required<Rest.Model.Event>["Contacts"]>>>;
        },
    } = {
        mails: {refType: "Messages", ...mappingItem()},
        folders: {refType: "Labels", ...mappingItem()},
        contacts: {refType: "Contacts", ...mappingItem()},
    };
    const mappingKeys = Object.keys(mapping) as Array<keyof typeof mapping>;

    for (const event of input.events) {
        for (const key of mappingKeys) {
            const {refType, updatesMappedByInstanceId: updatesMappedByInstanceId} = mapping[key];
            const updateItems = event[refType];
            if (!updateItems) {
                continue;
            }
            for (const updateItem of updateItems) {
                updatesMappedByInstanceId.set(updateItem.ID, (updatesMappedByInstanceId.get(updateItem.ID) || []).concat(updateItem));
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
                if (!upserted && isUpsertOperationType(update.Action)) {
                    upsertIds.push(update.ID);
                    upserted = true;
                }
                if (update.Action === Rest.Model.EVENT_ACTION.DELETE) {
                    remove.push({pk: Database.buildPk(update.ID)});
                    break;
                }
            }
        }
    }

    const patch: DbPatch = {
        conversationEntries: {remove: [], upsert: []},
        mails: {remove: mapping.mails.remove, upsert: []},
        folders: {remove: mapping.folders.remove, upsert: []},
        contacts: {remove: mapping.contacts.remove, upsert: []},
    };

    if (!nullUpsert) {
        // TODO process 404 error of fetching individual entity
        // so we could catch the individual entity fetching error
        // 404 error can be ignored as if it occurs because user was moved stuff from here to there while syncing cycle was in progress
        for (const id of mapping.mails.upsertIds) {
            const response = await api.message.get(id);
            patch.mails.upsert.push(await Database.buildMail(response.data.Message, api));
        }
        await (async () => {
            const labels = await api.label.query();
            const folders = labels
                .filter(({ID}) => mapping.folders.upsertIds.includes(ID))
                .map(Database.buildFolder);
            patch.folders.upsert.push(...folders);
        })();
        for (const id of mapping.contacts.upsertIds) {
            const contact = await api.contact.get(id);
            patch.contacts.upsert.push(Database.buildContact(contact));
        }
    } else {
        // we only need the data structure to be formed at this point, so no need to perform the actual fetching
        for (const key of mappingKeys) {
            mapping[key].upsertIds.forEach(() => {
                (patch[key].upsert as any[]).push(null);
            });
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
