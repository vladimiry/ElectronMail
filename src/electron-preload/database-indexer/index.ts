import PQueue from "p-queue";

import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS, IPC_MAIN_API_DB_INDEXER_ON_ACTIONS} from "src/shared/api/main";
import {LOGGER} from "./lib/contants";
import {SERVICES_FACTORY, addToMailsIndex, createMailsIndex, removeMailsFromIndex} from "./lib/util";
import {Unpacked} from "src/shared/types";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(LOGGER, "[index]");

// TODO drop "emptyObject"
const emptyObject = {};

const cleanup = SERVICES_FACTORY.cleanup();
const api = SERVICES_FACTORY.api(cleanup.promise);
const index = createMailsIndex();
const indexingQueue = new PQueue({concurrency: 1});

document.addEventListener("DOMContentLoaded", bootstrap);

function bootstrap() {
    cleanup.subscription.add(
        api.dbIndexerNotification().subscribe(
            dbIndexerNotificationHandler,
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

function dbIndexerNotificationHandler(action: Unpacked<ReturnType<typeof api.dbIndexerNotification>>): void {
    logger.verbose(`dbIndexerNotification.next, action.type:`, action.type);

    IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.match(action, {
        Bootstrap: async () => {
            logger.info("action.Bootstrap()");
            await api.dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.Bootstrapped()).toPromise();
            return emptyObject;
        },
        Index: async ({uid, key, remove, add}) => {
            logger.info(`action.Index()`, `Received mails to remove/add: ${remove.length}/${add.length}`);

            await api.dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.ProgressState({key, status: {indexing: true}})).toPromise();

            await indexingQueue.add(async () => {
                removeMailsFromIndex(index, remove);
                addToMailsIndex(index, add);
            });

            await Promise.all([
                api.dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.ProgressState({key, status: {indexing: false}})).toPromise(),
                api.dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.IndexingResult({uid})).toPromise(),
            ]);

            return emptyObject;
        },
        Search: async ({key, uid, query}) => {
            logger.info(`action.Search()`);

            await api.dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.ProgressState({key, status: {searching: true}})).toPromise();

            const {items, expandedTerms} = await indexingQueue.add(async () => {
                return index.search(query);
            });

            await Promise.all([
                api.dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.ProgressState({key, status: {searching: false}})).toPromise(),
                api.dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.SearchResult({uid, data: {items, expandedTerms}})).toPromise(),
            ]);

            return emptyObject;
        },
    });
}
