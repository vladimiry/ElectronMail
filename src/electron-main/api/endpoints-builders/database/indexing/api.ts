import electronLog from "electron-log";
import {defer} from "rxjs";
import {filter, first, startWith, takeUntil} from "rxjs/operators";

import {Context} from "src/electron-main/model";
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
import {curryFunctionMembers} from "src/shared/util";
import {indexAccount} from "src/electron-main/api/endpoints-builders/database/indexing/service";

const logger = curryFunctionMembers(electronLog, __filename);

export async function buildDbIndexingEndpoints(
    ctx: Context, // TODO make argument "DeepReadonly"
): Promise<Pick<IpcMainApiEndpoints, "dbIndexerOn" | "dbIndexerNotification">> {
    const endpoints: Unpacked<ReturnType<typeof buildDbIndexingEndpoints>> = {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async dbIndexerOn(action) {
            logger.info(nameof(endpoints.dbIndexerOn), `action.type: ${action.type}`);

            // propagating action to custom stream
            setTimeout(() => {
                IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$.next(action);
            });

            IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.match(action, {
                Bootstrapped() {
                    const indexAccounts$ = defer(
                        async () => {
                            const [{accounts}, config] = await Promise.all([
                                ctx.settingsStore.readExisting(),
                                ctx.config$.pipe(first()).toPromise(),
                            ]);
                            const logins = accounts.map(({login}) => login);

                            for (const {account, pk} of ctx.db) {
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
                ProgressState(payload) {
                    logger.verbose(nameof(endpoints.dbIndexerOn), `ProgressState.status: ${JSON.stringify(payload.status)}`);

                    // propagating status to main channel which streams data to UI process
                    setTimeout(() => {
                        IPC_MAIN_API_NOTIFICATION$.next(
                            IPC_MAIN_API_NOTIFICATION_ACTIONS.DbIndexerProgressState(payload),
                        );
                    });
                },
                ErrorMessage({message}) {
                    setTimeout(() => {
                        IPC_MAIN_API_NOTIFICATION$.next(
                            IPC_MAIN_API_NOTIFICATION_ACTIONS.ErrorMessage({message}),
                        );
                    });
                },
                default() {
                    // NOOP
                },
            });
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        dbIndexerNotification() {
            return IPC_MAIN_API_DB_INDEXER_NOTIFICATION$.asObservable().pipe(
                startWith(IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.Bootstrap({})),
            );
        },
    };

    return endpoints;
}
