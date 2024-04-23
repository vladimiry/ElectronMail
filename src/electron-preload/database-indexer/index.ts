import asap from "asap-es";

import {addToMailsIndex, createMailsIndex, removeMailsFromIndex, SERVICES_FACTORY} from "./service";
import {buildLoggerBundle} from "src/electron-preload/lib/util";
import {getPlainErrorProps} from "src/shared/util";
import {IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS, IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS} from "src/shared/api/main-process/actions";
import {IpcMainServiceScan} from "src/shared/api/main-process";
import {ONE_SECOND_MS} from "src/shared/const";

const logger = buildLoggerBundle(__filename);

// TODO drop "emptyObject"
const emptyObject = {} as const;
const cleanup = SERVICES_FACTORY.cleanup();
const api = SERVICES_FACTORY.apiClient(cleanup.promise);
const dbIndexerOn = api("dbIndexerOn", {timeoutMs: ONE_SECOND_MS * 15, logger});
const indexingQueue = new asap();
const index = createMailsIndex();

async function dbIndexerNotificationHandler(action: IpcMainServiceScan["ApiImplReturns"]["dbIndexerNotification"]): Promise<void> {
    logger.verbose(`dbIndexerNotification.next, action.type:`, action.type);

    await IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS.match(action, {
        Bootstrap: async () => {
            logger.info("action.Bootstrap()");

            await dbIndexerOn(IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS.Bootstrapped());

            return emptyObject;
        },
        Index: async ({uid, key, remove, add}) => {
            logger.info("action.Index()", `Received mails to remove/add: ${remove.length}/${add.length}`);

            await dbIndexerOn(IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS.ProgressState({key, status: {indexing: true}}));

            try {
                await indexingQueue.q(async () => {
                    removeMailsFromIndex(index, remove);
                    addToMailsIndex(index, add);
                });
            } finally {
                await dbIndexerOn(IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS.ProgressState({key, status: {indexing: false}}));
            }

            await dbIndexerOn(IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS.IndexingResult({uid}));

            return emptyObject;
        },
        Search: async ({uid, query}) => {
            logger.info("action.Search()");

            const {items, expandedTerms} = await indexingQueue.q(async () => {
                return index.search(query);
            });

            await dbIndexerOn(IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS.SearchResult({uid, data: {items, expandedTerms}}));

            return emptyObject;
        },
    });
}

document.addEventListener("DOMContentLoaded", () => {
    cleanup.subscription.add(
        api("dbIndexerNotification", {timeoutMs: ONE_SECOND_MS * 3, logger})().subscribe(async (action) => {
            try {
                await dbIndexerNotificationHandler(action);
            } catch (error) {
                logger.error(`dbIndexerNotification.next, action.type:`, action.type, error);
                await dbIndexerOn(IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS.ErrorMessage({message: (error as {message: string}).message}));
            }
        }, async (error) => {
            logger.error(`dbIndexerNotification.error`, error);
            await dbIndexerOn(IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS.ErrorMessage({message: (error as {message: string}).message}));
        }, () => {
            logger.info(`dbIndexerNotification.complete`);
        }),
    );

    logger.info(`dbIndexerNotification.subscribed`);
});

window.addEventListener("error", async (event) => {
    const {message, filename, lineno, colno, error} = event; // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        logger.error("uncaught error", {message, filename, lineno, colno, error: getPlainErrorProps(error)});
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        dbIndexerOn(IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS.ErrorMessage({message}));
    } catch (error) {
        if (BUILD_ENVIRONMENT === "development") {
            console.error(error); // eslint-disable-line no-console
        } else {
            logger.error(getPlainErrorProps(error));
        }
    }
    if (BUILD_ENVIRONMENT !== "development") {
        event.preventDefault();
    }
});
