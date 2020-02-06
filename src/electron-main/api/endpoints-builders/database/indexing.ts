import electronLog from "electron-log";
import {UnionOf} from "@vladimiry/unionize";
import {concatMap, filter, startWith, take, takeUntil} from "rxjs/operators";
import {defer, race, throwError, timer} from "rxjs";
import {observableToSubscribableLike} from "electron-rpc-api";
import {pick} from "remeda";
import {v4 as uuid} from "uuid";

import {Config} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {DbAccountPk, FsDbAccount, INDEXABLE_MAIL_FIELDS, Mail} from "src/shared/model/database";
import {
    IPC_MAIN_API_DB_INDEXER_NOTIFICATION$,
    IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$,
    IPC_MAIN_API_NOTIFICATION$,
} from "src/electron-main/api/constants";
import {
    IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS,
    IPC_MAIN_API_DB_INDEXER_ON_ACTIONS,
    IPC_MAIN_API_NOTIFICATION_ACTIONS,
    IpcMainApiEndpoints,
} from "src/shared/api/main";
import {ReadonlyDeep} from "type-fest";
import {curryFunctionMembers} from "src/shared/util";
import {hrtimeDuration} from "src/electron-main/util";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/api/endpoints-builders/database/indexing]");

export async function buildDbIndexingEndpoints(
    ctx: ReadonlyDeep<Context>,
): Promise<Pick<IpcMainApiEndpoints, "dbIndexerOn" | "dbIndexerNotification">> {
    return {
        async dbIndexerOn(action) {
            logger.info("dbIndexerOn()", `action.type: ${action.type}`);

            // propagating action to custom stream
            setTimeout(() => {
                IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$.next(action);
            });

            IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.match(action, {
                Bootstrapped: () => {
                    const indexAccounts$ = defer(
                        async () => {
                            const logins = (await ctx.settingsStore.readExisting())
                                .accounts
                                .map(({login}) => login);
                            const config = await ctx.configStore.readExisting();

                            for (const {account, pk} of ctx.db.accountsIterator()) {
                                if (logins.includes(pk.login)) {
                                    await indexAccount(account, pk, config);
                                }
                            }
                        },
                    ).pipe(
                        // drop indexing on "logout" action
                        takeUntil(
                            IPC_MAIN_API_NOTIFICATION$.pipe(
                                filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.SignedInStateChange),
                                filter(({payload: {signedIn}}) => !signedIn),
                            ),
                        ),
                    );

                    setTimeout(async () => {
                        await indexAccounts$.toPromise();
                    });
                },
                ProgressState: (payload) => {
                    logger.verbose("dbIndexerOn()", `ProgressState.status: ${JSON.stringify(payload.status)}`);

                    // propagating status to main channel which streams data to UI process
                    setTimeout(() => {
                        IPC_MAIN_API_NOTIFICATION$.next(
                            IPC_MAIN_API_NOTIFICATION_ACTIONS.DbIndexerProgressState(payload),
                        );
                    });
                },
                default: () => {
                    // NOOP
                },
            });
        },

        dbIndexerNotification() {
            return observableToSubscribableLike(
                IPC_MAIN_API_DB_INDEXER_NOTIFICATION$.asObservable().pipe(
                    startWith(IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.Bootstrap({})),
                )
            );
        },
    };
}

export const narrowIndexActionPayload: (
    payload: Skip<Extract<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS>, { type: "Index" }>["payload"], "uid">,
) => typeof payload = (() => {
    type Fn = typeof narrowIndexActionPayload;
    type Mails = ReturnType<Fn>["add"];

    const fieldsToIndex = [
        ((name: keyof Pick<Unpacked<Mails>, "pk">) => name)("pk"),
        ...INDEXABLE_MAIL_FIELDS,
    ];

    const result: Fn = ({key, remove, add}) => {
        return {
            key,
            remove,
            add: add.map((mail) => pick(mail, fieldsToIndex)),
        };
    };

    return result;
})();

export async function indexAccount(
    account: ReadonlyDeep<FsDbAccount>,
    key: ReadonlyDeep<DbAccountPk>,
    config: ReadonlyDeep<Config>,
): Promise<void> {
    logger.info("indexAccount()");

    const duration = hrtimeDuration();
    const buffer: Mail[] = [];

    for (const mail of Object.values(account.mails)) {
        buffer.push(mail);

        if (buffer.length < config.indexingBootstrapBufferSize) {
            continue;
        }

        await indexMails(buffer, key, config.timeouts.indexingBootstrap);
        buffer.length = 0;
    }

    if (buffer.length) {
        await indexMails(buffer, key, config.timeouts.indexingBootstrap);
    }

    logger.verbose("indexAccount() end", {indexed: account.mails.size, duration: duration.end()});
}

async function indexMails(
    mails: Array<ReadonlyDeep<Mail>>,
    key: ReadonlyDeep<DbAccountPk>,
    timeoutMs: number,
): Promise<void> {
    logger.info("indexMails()");

    const duration = hrtimeDuration();
    const uid = uuid();
    const result$ = race(
        IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$.pipe(
            filter(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.is.IndexingResult),
            filter(({payload}) => payload.uid === uid),
            take(1),
        ),
        timer(timeoutMs).pipe(
            concatMap(() => throwError(new Error(`Failed index emails in ${timeoutMs}ms (mails portions size: ${mails.length})`))),
        ),
    );

    IPC_MAIN_API_DB_INDEXER_NOTIFICATION$.next(
        IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.Index({
            uid,
            ...narrowIndexActionPayload({
                key,
                remove: [],
                add: mails,
            }),
        }),
    );

    return result$
        .toPromise()
        .then(() => {
            logger.verbose("indexMails() end", {indexed: mails.length, duration: duration.end()});
        });
}
