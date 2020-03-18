import {Deferred} from "ts-deferred";
import {filter} from "rxjs/operators";
import {webFrame} from "electron"; // tslint:disable-line:no-import-zones

import {IPC_MAIN_API, IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {Locale, Logger} from "src/shared/model/common";
import {ONE_SECOND_MS} from "src/shared/constants";

const releaseApiClientDeferred = new Deferred<void>();

const finishPromise = releaseApiClientDeferred.promise;

const setSpellCheckProvider: (
    locale: Locale | false,
    client: ReturnType<typeof IPC_MAIN_API.client>,
) => void = (locale, client) => {
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
                client("spellCheck")({words}) // eslint-disable-line @typescript-eslint/no-floating-promises
                    .then(({misspelledWords}) => callback(misspelledWords));
            },
        },
    );
};

const state: {
    setupNotificationListening: (logger: Logger) => void;
} = {
    setupNotificationListening(logger) {
        // we call it only once, so nooping the function
        state.setupNotificationListening = () => {}; // eslint-disable-line @typescript-eslint/no-empty-function

        const client = IPC_MAIN_API.client({options: {logger, finishPromise, timeoutMs: ONE_SECOND_MS}});
        const notificationSubscription = client("notification")()
            .pipe(filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.Locale))
            .subscribe(({payload: {locale}}) => setSpellCheckProvider(locale, client));

        window.addEventListener(
            "beforeunload",
            () => {
                notificationSubscription.unsubscribe();
                releaseApiClientDeferred.resolve();
            },
        );
    },
};

export function initSpellCheckProvider(logger: Logger): void {
    const client = IPC_MAIN_API.client({options: {logger, finishPromise, timeoutMs: ONE_SECOND_MS * 3}});
    const getSpellCheckMetadata = client("getSpellCheckMetadata");

    state.setupNotificationListening(logger);

    getSpellCheckMetadata() // eslint-disable-line @typescript-eslint/no-floating-promises
        .then(({locale}) => setSpellCheckProvider(locale, client));
}
