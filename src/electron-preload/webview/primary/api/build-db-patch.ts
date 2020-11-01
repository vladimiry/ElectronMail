import {concatMap, filter, first} from "rxjs/operators";
import {defer, race, throwError, timer} from "rxjs";

import * as Database from "src/electron-preload/webview/lib/database-entity";
import * as DatabaseModel from "src/shared/model/database";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";
import {DEFAULT_MESSAGES_STORE_PORTION_SIZE, ONE_SECOND_MS} from "src/shared/constants";
import {DbPatch} from "src/shared/api/common";
import {EVENT_ACTION} from "src/electron-preload/webview/lib/rest-model";
import {FsDbAccount, LABEL_TYPE, SYSTEM_FOLDER_IDENTIFIERS} from "src/shared/model/database";
import {Logger} from "src/shared/model/common";
import {ProtonPrimaryApi, ProtonPrimaryApiScan} from "src/shared/api/webview/primary";
import {ProviderApi} from "src/electron-preload/webview/primary/provider-api/model";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";
import {buildDbPatchRetryPipeline, buildEmptyDbPatch, fetchEvents, persistDatabasePatch} from "src/electron-preload/webview/lib/util";
import {curryFunctionMembers, isDatabaseBootstrapped} from "src/shared/util";
import {isProtonApiError, resolveCachedConfig, sanitizeProtonApiError} from "src/electron-preload/lib/util";
import {preprocessError} from "src/electron-preload/webview/primary/util";

interface DbPatchBundle {
    patch: DbPatch;
    metadata: FsDbAccount["metadata"];
}

type BuildDbPatchMethodReturnType = ProtonPrimaryApiScan["ApiImplReturns"]["buildDbPatch"];

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, "[api/build-db-patch]");

async function buildConversationDbMails(briefConversation: RestModel.Conversation, api: ProviderApi): Promise<DatabaseModel.Mail[]> {
    const result: DatabaseModel.Mail[] = [];
    const conversationFetchResponse = await api.conversation.getConversation(briefConversation.ID);
    const conversationMessages = conversationFetchResponse.Messages;

    for (const mail of conversationMessages) {
        if (mail.Body) {
            result.push(await Database.buildMail(mail, api));
            continue;
        }
        const mailFetchResponse = await api.message.getMessage(mail.ID);
        result.push(await Database.buildMail(mailFetchResponse.Message, api));
    }

    return result;
}

async function bootstrapDbPatch(
    providerApi: ProviderApi,
    parentLogger: Logger,
    triggerStoreCallback: (path: DbPatchBundle) => Promise<void>,
): Promise<void> {
    const logger = curryFunctionMembers(parentLogger, "bootstrapDbPatch()");
    // WARN: "getLatestID" should be called on top of the function, ie before any other fetching
    // so app is able to get any potentially missed changes happened during this function execution
    const {EventID: latestEventId} = await providerApi.events.getLatestID();

    if (!latestEventId) {
        throw new Error(`"getLatestID" call returned empty value`);
    }

    // WARN: "labels" need to be stored first of all to allow "database expolrer UI" show the intermediate data
    // so we include "labels/contacts" to the initial database patch

    const initialPatch = await (async () => {
        logger.verbose("start fetching contacts");

        const contacts = await (async () => {
            const {Contacts: items} = await providerApi.contact.queryContacts();
            const result: RestModel.Contact[] = [];
            for (const item of items) {
                const contactResponse = await providerApi.contact.getContact(item.ID);
                result.push(contactResponse.Contact);
            }
            return result;
        })();
        logger.info(`fetched ${contacts.length} contacts`);

        logger.verbose("start fetching folders");
        const [labelsResponse, foldersResponse] = await Promise.all([
            providerApi.label.get(LABEL_TYPE.MESSAGE_LABEL),
            providerApi.label.get(LABEL_TYPE.MESSAGE_FOLDER),
        ]);
        const folders = [...labelsResponse.Labels, ...foldersResponse.Labels];
        logger.info(`fetched ${folders.length} folders`);

        logger.verbose(`construct initial database patch`);
        const path = buildEmptyDbPatch();
        path.folders.upsert = folders.map(Database.buildFolder);
        path.contacts.upsert = contacts.map(Database.buildContact);

        return path;
    })();

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
        const {fetching: {messagesStorePortionSize = DEFAULT_MESSAGES_STORE_PORTION_SIZE}} = await resolveCachedConfig(logger);

        logger.info(JSON.stringify({messagesStorePortionSize}));

        let conversationsFetchResponse: Unpacked<ReturnType<typeof providerApi.conversation.queryConversations>> | undefined;
        let mailsPersistencePortion: DatabaseModel.Mail[] = [];
        let conversationsFetched = 0;
        let mailsFetched = 0;

        logger.verbose("start fetching conversations");
        while (!conversationsFetchResponse || conversationsFetchResponse.Conversations.length) {
            conversationsFetchResponse = await providerApi.conversation.queryConversations(conversationsQuery);
            const conversations = conversationsFetchResponse.Conversations;

            conversationsFetched += conversations.length;
            logger.verbose(`conversations fetch progress: ${conversationsFetched}`);

            for (const conversation of conversations) {
                const dbMails = await buildConversationDbMails(conversation, providerApi);

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

async function buildDbPatch(
    providerApi: ProviderApi,
    input: {
        events: Array<Pick<RestModel.Event, "Messages" | "Labels" | "Contacts">>;
        parentLogger: Logger;
    },
    nullUpsert = false,
): Promise<DbPatch> {
    const logger = curryFunctionMembers(input.parentLogger, "buildDbPatch()");
    const mapping: Record<"mails" | "folders" | "contacts", {
        remove: Array<{ pk: string }>;
        // TODO put entire entity update to "upsertIds" array ("gotTrashed" needed only for "message" updates)
        upsertIds: Array<{ id: RestModel.Id; gotTrashed?: boolean }>;
    }> & {
        mails: {
            updatesArrayPropName: keyof Pick<RestModel.Event, "Messages">;
            updatesMappedByEntityId: Map<RestModel.Id, Array<Unpacked<Required<RestModel.Event>["Messages"]>>>;
        };
        folders: {
            updatesArrayPropName: keyof Pick<RestModel.Event, "Labels">;
            updatesMappedByEntityId: Map<RestModel.Id, Array<Unpacked<Required<RestModel.Event>["Labels"]>>>;
        };
        contacts: {
            updatesArrayPropName: keyof Pick<RestModel.Event, "Contacts">;
            updatesMappedByEntityId: Map<RestModel.Id, Array<Unpacked<Required<RestModel.Event>["Contacts"]>>>;
        };
    } = {
        mails: {
            updatesArrayPropName: "Messages",
            updatesMappedByEntityId: new Map(),  // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            remove: [],
            upsertIds: []
        },
        folders: {
            updatesArrayPropName: "Labels",
            updatesMappedByEntityId: new Map(), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            remove: [],
            upsertIds: [],
        },
        contacts: {
            updatesArrayPropName: "Contacts",
            updatesMappedByEntityId: new Map(), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            remove: [],
            upsertIds: [],
        },
    };
    const entityTypes = Object.keys(mapping) as Array<keyof typeof mapping>;

    for (const event of input.events) {
        for (const entityType of entityTypes) {
            const {updatesArrayPropName, updatesMappedByEntityId} = mapping[entityType];

            for (const update of (event[updatesArrayPropName] ?? [])) {
                updatesMappedByEntityId.set(
                    update.ID,
                    [
                        ...(updatesMappedByEntityId.get(update.ID) ?? []),
                        update,
                    ],
                );
            }
        }
    }

    logger.verbose([
        `resolved unique entities to process history chain:`,
        entityTypes.map((key) => `${key}: ${mapping[key].updatesMappedByEntityId.size}`).join("; "),
    ].join(" "));

    for (const entityType of entityTypes) {
        const {updatesMappedByEntityId, upsertIds, remove} = mapping[entityType];

        for (const updates of updatesMappedByEntityId.values()) {
            const deleteUpdate = updates.find(({Action}) => Action === RestModel.EVENT_ACTION.DELETE);

            if (deleteUpdate) {
                // "delete" action is irrecoverable
                // so if it presents in the updates list then we don't process the list any longer
                remove.push({pk: Database.buildPk(deleteUpdate.ID)});
            } else {
                // we take here just last update item since all non-"delete" actions treated as "update" actions
                const [update] = updates.slice().reverse(); // immutable reversing

                upsertIds.push({
                    id: update.ID,
                    gotTrashed: Boolean(
                        update.Message?.LabelIDsAdded?.includes(SYSTEM_FOLDER_IDENTIFIERS.Trash),
                    ),
                });
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
        // TODO process 404 error of fetching individual entity ("message" case is handled, see "error.data.Code === 15052" check below)
        //      so we could catch the individual entity fetching error
        //      404 error can be ignored as if it occurs because user was moving the email from here to there ending up
        //      removing it while syncing cycle was in progress

        // fetching mails
        for (const {id, gotTrashed} of mapping.mails.upsertIds) {
            try {
                const response = await providerApi.message.getMessage(id);
                patch.mails.upsert.push(await Database.buildMail(response.Message, providerApi));
            } catch (error) {
                if (
                    gotTrashed
                    &&
                    isProtonApiError(error)
                    &&
                    ( // message has already been removed error condition:
                        error.status === 422
                        &&
                        error.data?.Code === 15052
                    )
                ) { // ignoring the error as permissible
                    // TODO figure how to suppress displaying this error on "proton ui" in the case we initiated it (triggered the fetching)
                    logger.warn(
                        // WARN don't log message-specific data as it might include sensitive fields
                        `skip message fetching as it has been already removed from the trash before fetch action started`,
                        // WARN don't log full error as it might include sensitive data
                        JSON.stringify(
                            sanitizeProtonApiError(error),
                        ),
                    );
                } else {
                    throw error;
                }
            }
        }

        // fetching folders/labels
        if (mapping.folders.upsertIds.length) {
            const upsertIds = mapping.folders.upsertIds.map(({id}) => id);
            await (async () => {
                // TODO explore possibility to fetch folders by IDs ("upsertIds" variable)
                //      currently we fetch all of them and reduce the needed
                const [labelsResponse, foldersResponse] = await Promise.all([
                    providerApi.label.get(LABEL_TYPE.MESSAGE_LABEL),
                    providerApi.label.get(LABEL_TYPE.MESSAGE_FOLDER),
                ]);
                const allFoldersFromServer = [...labelsResponse.Labels, ...foldersResponse.Labels];
                const foldersToPush = allFoldersFromServer
                    .filter(({ID}) => upsertIds.includes(ID))
                    .map(Database.buildFolder);
                patch.folders.upsert.push(...foldersToPush);
            })();
        }

        // fetching contacts
        for (const {id} of mapping.contacts.upsertIds) {
            const contactResponse = await providerApi.contact.getContact(id);
            patch.contacts.upsert.push(Database.buildContact(contactResponse.Contact));
        }
    } else {
        // we only need the data structure to be formed at this point, so no need to perform the actual fetching
        for (const key of entityTypes) {
            mapping[key].upsertIds.forEach(() => {
                (patch[key].upsert as any[]) // eslint-disable-line @typescript-eslint/no-explicit-any
                    .push(null);
            });
        }
    }

    logger.verbose([
        `upsert/remove:`,
        entityTypes.map((key) => `${key}: ${patch[key].upsert.length}/${patch[key].remove.length}`).join("; "),
    ].join(" "));

    return patch;
}

const buildDbPatchEndpoint = (providerApi: ProviderApi): Pick<ProtonPrimaryApi, "buildDbPatch" | "fetchSingleMail"> => {
    return {
        buildDbPatch(input) {
            const logger = curryFunctionMembers(_logger, "buildDbPatch()", input.zoneName);

            logger.info();

            const deferFactory: () => Promise<BuildDbPatchMethodReturnType> = async () => {
                logger.info("delayFactory()");

                // TODO handle "account.entryUrl" change event
                // the account state keeps the "signed-in" state despite of page still being reloaded
                // so we need to reset "signed-in" state with "account.entryUrl" value change
                await race(
                    providerApi._custom_.loggedIn$.pipe(
                        filter(Boolean), // should be logged in
                        first(),
                    ),
                    // timeout value of calling "buildDbPatch()" is long so we setup custom one here just to test the logged-in state
                    timer(ONE_SECOND_MS * 5).pipe(
                        concatMap(() => throwError(new Error(`User is supposed to be logged-in`))),
                    ),
                ).toPromise();

                if (!isDatabaseBootstrapped(input.metadata)) {
                    await bootstrapDbPatch(
                        providerApi,
                        logger,
                        async (dbPatch) => {
                            await persistDatabasePatch(
                                {
                                    ...dbPatch,
                                    login: input.login,
                                },
                                logger,
                            );
                        },
                    );

                    return;
                }

                {
                    const {events, latestEventId} = await fetchEvents(providerApi, input.metadata.latestEventId, logger);

                    await persistDatabasePatch(
                        {
                            patch: await buildDbPatch(providerApi, {events, parentLogger: logger}),
                            metadata: {latestEventId},
                            login: input.login,
                        },
                        logger,
                    );
                }

                return void 0;
            };

            return defer(deferFactory).pipe(
                buildDbPatchRetryPipeline<BuildDbPatchMethodReturnType>(preprocessError, input.metadata, _logger),
            );
        },

        async fetchSingleMail(input) {
            const logger = curryFunctionMembers(_logger, "fetchSingleMail()", input.zoneName);

            logger.info();

            const data: DbPatchBundle = {
                patch: await buildDbPatch(
                    providerApi,
                    {
                        events: [
                            {
                                Messages: [{
                                    ID: input.mailPk,
                                    // it can be any action but not "EVENT_ACTION.DELETE"
                                    // so messages gets reduced as an updated and gets updated in the local database then
                                    Action: EVENT_ACTION.UPDATE
                                }],
                            },
                        ],
                        parentLogger: logger,
                    },
                ),
                metadata: {
                    // WARN: don't persist the "latestEventId" value in the case of single mail saving
                    latestEventId: "",
                },
            };

            await persistDatabasePatch(
                {
                    ...data,
                    login: input.login,
                },
                logger,
            );
        },
    };
};

export {
    buildDbPatchEndpoint,
    buildDbPatch,
};
