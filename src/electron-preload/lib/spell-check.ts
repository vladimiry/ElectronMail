import {Deferred} from "ts-deferred";
import {webFrame} from "electron"; // tslint:disable-line:no-import-zones

import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {Locale, Logger} from "src/shared/model/common";
import {ONE_SECOND_MS} from "src/shared/constants";
import {resolveIpcMainApi} from "src/electron-preload/lib/util";
import {ofType} from "src/shared/ngrx-util-of-type";

const apiClientCleanupService = (() => {
    const deferred = new Deferred<void>();
    return {
        release: () => deferred.resolve(),
        finishPromise: deferred.promise,
    };
})();

const setSpellCheckProvider = (locale: Locale | false, ipcMainApiClient: ReturnType<typeof resolveIpcMainApi>): void => {
    if (typeof locale !== "string") {
        // TODO figure how to undone/cancel "webFrame.setSpellCheckProvider" action, ie reset spell check provider
        // right now we just use dummy provider so IPC communication will be still in place
        // but dummy provider always returns empty misspelled words array
        return;
    }

    webFrame.setSpellCheckProvider(
        locale,
        {
            spellCheck(words, callback) {
                ipcMainApiClient("spellCheck")({words}) // eslint-disable-line @typescript-eslint/no-floating-promises
                    .then(({misspelledWords}) => callback(misspelledWords));
            },
        },
    );
};

const state: {
    setupNotificationListening: (ipcMainApiClient: ReturnType<typeof resolveIpcMainApi>,) => void;
} = {
    setupNotificationListening(ipcMainApiClient) {
        // we call it only once, so nooping the function
        state.setupNotificationListening = () => {}; // eslint-disable-line @typescript-eslint/no-empty-function

        const notificationSubscription = ipcMainApiClient("notification")()
            .pipe(ofType(IPC_MAIN_API_NOTIFICATION_ACTIONS.Locale))
            .subscribe(({payload: {locale}}) => setSpellCheckProvider(locale, ipcMainApiClient));

        window.addEventListener(
            "beforeunload",
            () => {
                notificationSubscription.unsubscribe();
                apiClientCleanupService.release();
            },
        );
    },
};

export function initSpellCheckProvider(logger: Logger): void {
    const ipcMainApiClient = resolveIpcMainApi({
        logger,
        finishPromise: apiClientCleanupService.finishPromise,
        timeoutMs: ONE_SECOND_MS * 3
    });

    state.setupNotificationListening(ipcMainApiClient);

    ipcMainApiClient("getSpellCheckMetadata")() // eslint-disable-line @typescript-eslint/no-floating-promises
        .then(({locale}) => setSpellCheckProvider(locale, ipcMainApiClient));
}
