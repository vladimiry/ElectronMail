import {chunk, pick} from "remeda";
import {from, merge, Observable, Subject} from "rxjs";

import {buildEmptyDbPatch} from "src/electron-preload/webview/lib/util";
import {curryFunctionMembers} from "src/shared/util";
import * as Database from "src/electron-preload/webview/lib/database-entity";
import * as DatabaseModel from "src/shared/model/database";
import {DbPatchBundle} from "./model";
import {DEFAULT_MESSAGES_STORE_PORTION_SIZE, ONE_SECOND_MS, PACKAGE_VERSION} from "src/shared/const";
import {FsDbAccount, LABEL_TYPE, SYSTEM_FOLDER_IDENTIFIERS} from "src/shared/model/database";
import {isIgnorable404Error} from "../../util";
import {Logger} from "src/shared/model/common";
import {PROTON_MAX_CONCURRENT_FETCH, PROTON_MAX_QUERY_PORTION_LIMIT} from "src/electron-preload/webview/lib/const";
import {ProviderApi} from "src/electron-preload/webview/primary/provider-api/model";
import {resolveCachedConfig, resolveIpcMainApi, sanitizeProtonApiError} from "src/electron-preload/lib/util";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";

export const bootstrapDbPatch = (
    {login, metadata}: {login: string; metadata: FsDbAccount["metadata"] | null},
    providerApi: ProviderApi,
    parentLogger: Logger,
    triggerStoreCallback: (path: DbPatchBundle) => Promise<void>,
): Observable<{progress: string}> => {
    const logger = curryFunctionMembers(parentLogger, nameof(bootstrapDbPatch));
    const progress$ = new Subject<{progress: string}>();

    return merge(
        progress$,
        from((async () => {
            const resume = metadata?.fetchStage?.startsWith("bootstrap_");
            const {fetching: {messagesStorePortionSize = DEFAULT_MESSAGES_STORE_PORTION_SIZE}} = await resolveCachedConfig(logger);
            // WARN: "getLatestID" should be called on top of the function, ie before any other fetching
            // so the app is able to get any potentially missed changes happened during the function execution
            const {EventID: latestEventId} = resume
                ? {EventID: metadata?.latestEventId}
                : await providerApi.events.getLatestID();

            logger.verbose(JSON.stringify({resume, messagesStorePortionSize}));

            if (!latestEventId) {
                throw new Error(`Invalid "${nameof(latestEventId)}" value`);
            }

            if (!resume) {
                progress$.next({progress: `"local store" bootstrapping stage 1/3: loading folders and contacts`});

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

                const [labelsResponse, foldersResponse] = await Promise.all([
                    providerApi.label.get(LABEL_TYPE.MESSAGE_LABEL),
                    providerApi.label.get(LABEL_TYPE.MESSAGE_FOLDER),
                ]);
                const folders = [...labelsResponse.Labels, ...foldersResponse.Labels];
                logger.info(`fetched ${folders.length} folders`);

                const patch = buildEmptyDbPatch();
                patch.folders.upsert = folders.map(Database.buildFolder);
                patch.contacts.upsert = contacts.map(Database.buildContact);
                await triggerStoreCallback({patch, metadata: {latestEventId, fetchStage: "bootstrap_init"}});
            }

            const upsertMessages = async (
                upsert: DatabaseModel.Mail[],
                fetchStage: Exclude<FsDbAccount["metadata"]["fetchStage"], undefined>,
            ): Promise<void> => {
                const patch = buildEmptyDbPatch();
                patch.mails.upsert = upsert;
                await triggerStoreCallback({patch, metadata: {latestEventId, fetchStage}});
            };
            const resolveBootstrappedMessageIds = async (): Promise<DeepReadonly<Array<{ID: string}>>> => {
                return resolveIpcMainApi({timeoutMs: ONE_SECOND_MS * 30, logger})("dbGetAccountBootstrapRawMailIds")({login});
            };

            if (
                !resume
                || metadata?.fetchStage !== "bootstrap_messages_content"
            ) {
                progress$.next({progress: `"local store" bootstrapping stage 2/3: loading messages metadata...`});

                const flushSize = messagesStorePortionSize * 10;
                const labelId = SYSTEM_FOLDER_IDENTIFIERS["All Mail"];
                let fetchCount = (await resolveBootstrappedMessageIds()).length;
                let fetchResponse: Unpacked<ReturnType<typeof providerApi.message.queryMessageMetadata>> | undefined;
                let persistencePortion: DatabaseModel.Mail[] = [];
                let oldestMailData = await resolveIpcMainApi({timeoutMs: ONE_SECOND_MS, logger})(
                    "dbGetAccountBootstrapOldestRawMailMetadata",
                )({login});

                const {Total: totalMessagesCount} = await (async () => {
                    const {Counts} = await providerApi.message.queryMessageCount();
                    const count = Counts.find((value) => value.LabelID === labelId);
                    if (typeof count !== "object") {
                        throw new Error(`Unexpected "${nameof(providerApi.message.queryMessageCount)}" result value received`);
                    }
                    return count;
                })();

                while (!fetchResponse || fetchResponse.Messages.length) {
                    const {Messages: messages} = (fetchResponse = await providerApi.message.queryMessageMetadata({
                        Limit: PROTON_MAX_QUERY_PORTION_LIMIT,
                        Location: labelId,
                        Sort: "Time",
                        Desc: 1,
                        EndID: oldestMailData?.ID,
                        End: oldestMailData?.Time,
                    }));

                    fetchCount += messages.length;
                    progress$.next({
                        progress: [
                            `"local store" bootstrapping stage 2/3:`,
                            ` loading messages metadata (${fetchCount}/${totalMessagesCount})`,
                            ` | saving portion size: ${flushSize}`,
                        ].join(""),
                    });

                    for (const message of messages) {
                        persistencePortion.push(
                            await Database.buildMail(message, providerApi, {
                                type: "bootstrap-fetch",
                                appVersion: PACKAGE_VERSION,
                                date: Date.now(),
                                errorMessage: "...", // can't be empty (db validation)
                                errorStack: "...", // can't be empty (db validation)
                            }),
                        );
                        if (persistencePortion.length >= flushSize) {
                            await upsertMessages(persistencePortion, "bootstrap_messages_metadata");
                            persistencePortion = [];
                        }
                    }

                    if (messages.length) {
                        const lastItem = messages[messages.length - 1];
                        if (lastItem) {
                            oldestMailData = pick(lastItem, ["ID", "Time"]);
                        } else {
                            throw new Error(`Invalid "${nameof(oldestMailData)}" value candidate`);
                        }
                    }
                }

                logger.info(`fetched ${fetchCount} messages`);
                await upsertMessages(persistencePortion, "bootstrap_messages_content");
            }

            {
                progress$.next({progress: `"local store" bootstrapping stage 3/3: loading messages content`});

                const flushSize = messagesStorePortionSize;
                const bootstrappedMessageIds = await resolveBootstrappedMessageIds();
                let persistencePortion: DatabaseModel.Mail[] = [];
                let fetchCount = 0;

                for (const bootstrappedMessageIdsChunk of chunk(bootstrappedMessageIds, PROTON_MAX_CONCURRENT_FETCH)) {
                    await Promise.all(bootstrappedMessageIdsChunk.map(async ({ID: storedMessageId}) => {
                        try {
                            const {Message} = await providerApi.message.getMessage(storedMessageId);
                            persistencePortion.push(await Database.buildMail(Message, providerApi));
                        } catch (error) {
                            if (!isIgnorable404Error(error)) {
                                throw error;
                            }
                            logger.warn(
                                `skip message fetching as it has been already removed from the trash before fetch action started`,
                                JSON.stringify(sanitizeProtonApiError(error)),
                            );
                            // skipping "removed" message processing/fetching
                            return;
                        }
                        fetchCount++;
                        progress$.next({
                            progress: [
                                `"local store" bootstrapping stage 3/3:`,
                                ` loading messages content (${fetchCount}/${bootstrappedMessageIds.length})`,
                                ` | saving portion size: ${flushSize}`,
                            ].join(""),
                        });
                    }));
                    if (persistencePortion.length >= flushSize) {
                        await upsertMessages(persistencePortion, "bootstrap_messages_content");
                        persistencePortion = [];
                    }
                }

                logger.info(`fetched ${fetchCount} messages`);
                await upsertMessages(persistencePortion, "bootstrap_final");
            }

            progress$.complete();

            return {progress: `${nameof(bootstrapDbPatch)}: completed`};
        })()),
    );
};
