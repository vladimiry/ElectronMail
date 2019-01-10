import PQueue from "p-queue";
import {Deferred} from "ts-deferred";
import {Subscription} from "rxjs";

import {IPC_MAIN_API, IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS, IPC_MAIN_API_DB_INDEXER_ON_ACTIONS} from "src/shared/api/main";
import {LOGGER} from "./lib/contants";
import {ONE_SECOND_MS} from "src/shared/constants";
import {addToMailsIndex, buildMailsIndex, removeMailsFromIndex} from "./lib/util";
import {curryFunctionMembers} from "src/shared/util";

const cleanupSubscription = new Subscription();
const cleanupDeferred = new Deferred();
const cleanupPromise = cleanupDeferred.promise;

window.onbeforeunload = () => {
    cleanupSubscription.unsubscribe();
    cleanupDeferred.resolve();
    logger.info(`"window.beforeunload" handler executed`);
};

const logger = curryFunctionMembers(LOGGER, "[index]");
const indexingQueue = new PQueue({concurrency: 1});
const index = buildMailsIndex();

(async () => {
    const api = (() => {
        const client = IPC_MAIN_API.buildClient();
        const callOptions = {timeoutMs: ONE_SECOND_MS, finishPromise: cleanupPromise};
        return {
            dbIndexerOn: client("dbIndexerOn", callOptions),
            dbIndexerNotification: client("dbIndexerNotification", callOptions),
        };
    })();

    await api.dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.Bootstrapped()).toPromise();

    cleanupSubscription.add(
        api.dbIndexerNotification().subscribe((action) => {
            IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.match(action, {
                Index: async ({remove, add}) => {
                    logger.info(`Received mails to remove/add: ${remove.length}/${add.length}`);

                    await indexingQueue.add(async () => {
                        await api.dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.IndexingState({status: "indexing"})).toPromise();

                        removeMailsFromIndex(index, remove);
                        addToMailsIndex(index, add);

                        await api.dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.IndexingState({status: "done"})).toPromise();
                    });

                    // TODO indexing: drop next line
                    return {};
                },
                default: () => {
                    // TODO transfer error to main process, log it and display it to the user
                    const error = new Error(`Unsupported "dbIndexerNotification" action type: ${action.type}`);
                    logger.error(error);
                    throw error;
                },
            });
        }),
    );
})().catch((error) => {
    logger.error("uncaught promise rejection", error);
});
