import {Deferred} from "ts-deferred";
import {webFrame} from "electron"; // tslint:disable-line:no-import-zones

import {IPC_MAIN_API, IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {Locale, Logger} from "src/shared/types";
import {ONE_SECOND_MS} from "src/shared/constants";

const releaseApiClientDeferred = new Deferred<void>();

const finishPromise = releaseApiClientDeferred.promise;

const state: {
    setupNotificationListening: (logger: Logger) => void;
} = {
    setupNotificationListening(logger) {
        // we call it only once, so nooping the function
        state.setupNotificationListening = () => {};

        const client = IPC_MAIN_API.client({options: {logger, finishPromise, timeoutMs: ONE_SECOND_MS}});
        const notificationSubscription = client("notification")().subscribe(
            (notification) => {
                if (IPC_MAIN_API_NOTIFICATION_ACTIONS.is.Locale(notification)) {
                    const {locale} = notification.payload;
                    setSpellCheckProvider(locale, client);
                }
            },
        );

        window.addEventListener(
            "beforeunload",
            () => {
                notificationSubscription.unsubscribe();
                releaseApiClientDeferred.resolve();
            },
        );
    },
};

export function initSpellCheckProvider(logger: Logger) {
    const client = IPC_MAIN_API.client({options: {logger, finishPromise, timeoutMs: ONE_SECOND_MS * 3}});
    const getSpellCheckMetadata = client("getSpellCheckMetadata");

    state.setupNotificationListening(logger);

    getSpellCheckMetadata() // tslint:disable-line:no-floating-promises
        .then(({locale}) => setSpellCheckProvider(locale, client));
}

function setSpellCheckProvider(
    locale: Locale,
    client: ReturnType<typeof IPC_MAIN_API.client>,
) {
    webFrame.setSpellCheckProvider(
        locale,
        {
            spellCheck(words, callback) {
                client("spellCheck")({words}) // tslint:disable-line:no-floating-promises
                    .then(({misspelledWords}) => callback(misspelledWords));
            },
        },
    );
}
