import electronLog from "electron-log";
import {defer, lastValueFrom} from "rxjs";
import {filter, first, startWith, takeUntil} from "rxjs/operators";

import {Context} from "src/electron-main/model";
import {
    IPC_MAIN_API_DB_INDEXER_REQUEST$,
    IPC_MAIN_API_DB_INDEXER_RESPONSE$,
    IPC_MAIN_API_NOTIFICATION$,
} from "src/electron-main/api/constants";
import {
    IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS,
    IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS,
    IPC_MAIN_API_NOTIFICATION_ACTIONS
} from "src/shared/api/main-process/actions";
import {IpcMainApiEndpoints,} from "src/shared/api/main-process";
import {curryFunctionMembers} from "src/shared/util";
import {indexAccount} from "src/electron-main/api/endpoints-builders/database/indexing/service";
import {ofType} from "src/shared/ngrx-util-of-type";

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
                IPC_MAIN_API_DB_INDEXER_RESPONSE$.next(action);
            });

            IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS.match(action, {
                Bootstrapped() {
                    const indexAccounts$ = defer(
                        async () => {
                            const [{accounts}, config] = await Promise.all([
                                ctx.settingsStore.readExisting(),
                                lastValueFrom(ctx.config$.pipe(first())),
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
                                ofType(IPC_MAIN_API_NOTIFICATION_ACTIONS.SignedInStateChange),
                                filter(({payload: {signedIn}}) => !signedIn),
                            ),
                        ),
                    );

                    setTimeout(async () => {
                        await lastValueFrom(indexAccounts$);
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
            return IPC_MAIN_API_DB_INDEXER_REQUEST$.asObservable().pipe(
                startWith(IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS.Bootstrap()),
            );
        },
    };

    return endpoints;
}
