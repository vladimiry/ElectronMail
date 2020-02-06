import asap from "asap-es";

import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS, IPC_MAIN_API_DB_INDEXER_ON_ACTIONS, IpcMainServiceScan} from "src/shared/api/main";
import {LOGGER} from "./lib/contants";
import {ONE_SECOND_MS} from "src/shared/constants";
import {SERVICES_FACTORY, addToMailsIndex, createMailsIndex, removeMailsFromIndex} from "./lib/util";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(LOGGER, "[index]");

// TODO drop "emptyObject"
const emptyObject = {};

const cleanup = SERVICES_FACTORY.cleanup();
const api = SERVICES_FACTORY.apiClient(cleanup.promise);
const index = createMailsIndex();
const indexingQueue = new asap();

document.addEventListener("DOMContentLoaded", bootstrap);

function bootstrap() {
    cleanup.subscription.add(
        api("dbIndexerNotification", {timeoutMs: ONE_SECOND_MS * 3, logger})().subscribeLike(
            async (action) => {
                try {
                    await dbIndexerNotificationHandler(action);
                } catch (error) {
                    logger.error(`dbIndexerNotification.next, action.type:`, action.type, error);
                    throw error;
                }
            },
            (error) => {
                logger.error(`dbIndexerNotification.error`, error);
                throw error;
            },
            () => {
                logger.info(`dbIndexerNotification.complete`);
            },
        ),
    );

    logger.info(`dbIndexerNotification.subscribed`);
}

async function dbIndexerNotificationHandler(action: IpcMainServiceScan["ApiImplReturns"]["dbIndexerNotification"]): Promise<void> {
    logger.verbose(`dbIndexerNotification.next, action.type:`, action.type);

    const dbIndexerOn = api("dbIndexerOn", {timeoutMs: ONE_SECOND_MS * 15, logger});

    await IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.match(
        action,
        {
            Bootstrap: async () => {
                logger.info("action.Bootstrap()");

                await dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.Bootstrapped());

                return emptyObject;
            },
            Index: async ({uid, key, remove, add}) => {
                logger.info(`action.Index()`, `Received mails to remove/add: ${remove.length}/${add.length}`);

                await dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.ProgressState({key, status: {indexing: true}}));

                await indexingQueue.q(async () => {
                    removeMailsFromIndex(index, remove);
                    addToMailsIndex(index, add);
                });

                await Promise.all([
                    dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.ProgressState({key, status: {indexing: false}})),
                    dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.IndexingResult({uid})),
                ]);

                return emptyObject;
            },
            Search: async ({key, uid, query}) => {
                logger.info(`action.Search()`);

                await dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.ProgressState({key, status: {searching: true}}));

                const {items, expandedTerms} = await indexingQueue.q(async () => {
                    return index.search(query);
                });

                await Promise.all([
                    dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.ProgressState({key, status: {searching: false}})),
                    dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.SearchResult({uid, data: {items, expandedTerms}})),
                ]);

                return emptyObject;
            },
        },
    );
}
