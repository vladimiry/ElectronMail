import "src/electron-preload/browser-window/electron-exposure";
import {IPC_MAIN_API, IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS, IPC_MAIN_API_DB_INDEXER_ON} from "src/shared/api/main";
import {LOGGER} from "src/electron-preload/database-indexer/lib/contants";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(LOGGER, ["index"]);

(async () => {
    const apiClient = IPC_MAIN_API.buildClient();
    const apiMethods = {
        dbIndexerOn: apiClient("dbIndexerOn"),
        dbIndexerNotification: apiClient("dbIndexerNotification"),
    };

    await apiMethods.dbIndexerOn(IPC_MAIN_API_DB_INDEXER_ON.Bootstrapped()).toPromise();

    apiMethods
        .dbIndexerNotification()
        .subscribe((action) => {
            IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.match(action, {
                Index: ({add, remove}) => {
                    // tslint:disable-next-line
                    console.log({add, remove});
                    // TODO indexing: drop next line
                    return {};
                },
                default: () => {
                    // TODO indexing: drop next line
                    return {};
                },
            });
        });
})().catch((error) => {
    logger.error("uncaught promise rejection", error);
});
