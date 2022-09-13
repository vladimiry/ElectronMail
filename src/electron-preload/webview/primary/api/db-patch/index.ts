import {concatMap, filter, first, mergeMap} from "rxjs/operators";
import {defer, from, lastValueFrom, Observable, of, race, throwError, timer} from "rxjs";

import {bootstrapDbPatch} from "./bootstrap";
import {buildDbPatch} from "./patch";
import {BuildDbPatchMethodReturnType, DbPatchBundle} from "./model";
import {buildDbPatchRetryPipeline, fetchEvents, persistDatabasePatch} from "src/electron-preload/webview/lib/util";
import {curryFunctionMembers, isDatabaseBootstrapped} from "src/shared/util";
import {EVENT_ACTION} from "src/electron-preload/webview/lib/rest-model";
import {ONE_SECOND_MS} from "src/shared/const";
import {preprocessError} from "src/electron-preload/webview/primary/util";
import {ProtonPrimaryApi} from "src/shared/api/webview/primary";
import {ProviderApi} from "src/electron-preload/webview/primary/provider-api/model";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, __filename);

const buildDbPatchEndpoint = (providerApi: ProviderApi): Pick<ProtonPrimaryApi,
    | "buildDbPatch"
    | "throwErrorOnRateLimitedMethodCall"
    | "fetchSingleMail"> => {
    const endpoints: ReturnType<typeof buildDbPatchEndpoint> = {
        async throwErrorOnRateLimitedMethodCall(input) {
            curryFunctionMembers(_logger, nameof(endpoints.throwErrorOnRateLimitedMethodCall), input.accountIndex).info();
            providerApi._throwErrorOnRateLimitedMethodCall = true;
        },

        buildDbPatch(input) {
            const logger = curryFunctionMembers(_logger, nameof(endpoints.buildDbPatch), input.accountIndex);

            logger.info();

            delete providerApi._throwErrorOnRateLimitedMethodCall;

            const deferFactory = (): Observable<BuildDbPatchMethodReturnType> => {
                logger.info(nameof(deferFactory));

                return from(
                    (async () => {
                        // TODO handle "account.entryUrl" change event
                        // the account state keeps the "signed-in" state despite of page still being reloaded
                        // so we need to reset "signed-in" state with "account.entryUrl" value change
                        await lastValueFrom(
                            race(
                                providerApi._custom_.loggedIn$.pipe(
                                    filter(Boolean), // should be logged in
                                    first(),
                                ),
                                // timeout value of calling "buildDbPatch()" is long
                                // so we setup a custom one here just to test the logged-in state
                                timer(ONE_SECOND_MS * 5).pipe(
                                    concatMap(() => throwError(new Error(`User is supposed to be logged-in`))),
                                ),
                            ),
                        );
                        return (
                            isDatabaseBootstrapped(input.metadata)
                            &&
                            fetchEvents(providerApi, input.metadata.latestEventId, logger)
                        );
                    })(),
                ).pipe(
                    mergeMap((fetchedEvents) => {
                        if (typeof fetchedEvents === "object") {
                            return from((async () => {
                                await persistDatabasePatch(
                                    providerApi,
                                    {
                                        patch: await buildDbPatch(providerApi, {events: fetchedEvents.events, parentLogger: logger}),
                                        metadata: {latestEventId: fetchedEvents.latestEventId, fetchStage: "events"},
                                        login: input.login,
                                    },
                                    logger,
                                );
                            })()).pipe(
                                mergeMap(() => of({progress: `${nameof(persistDatabasePatch)}: completed`})),
                            );
                        }
                        return bootstrapDbPatch(
                            {
                                login: input.login,
                                metadata: fetchedEvents === "refresh"
                                    ? (input.metadata ? {...input.metadata, fetchStage: undefined} : input.metadata)
                                    : input.metadata,
                            },
                            providerApi,
                            logger,
                            async (patch) => {
                                return persistDatabasePatch(
                                    providerApi,
                                    {...patch, login: input.login},
                                    logger,
                                );
                            },
                        );
                    }),
                );
            };

            return defer(deferFactory).pipe(
                buildDbPatchRetryPipeline<BuildDbPatchMethodReturnType>(preprocessError, input.metadata, _logger),
            );
        },

        async fetchSingleMail(input) {
            const logger = curryFunctionMembers(_logger, nameof(endpoints.fetchSingleMail), input.accountIndex);

            logger.info();

            const data: DbPatchBundle = {
                patch: await buildDbPatch(
                    providerApi,
                    {
                        events: [
                            {
                                Messages: [{
                                    ID: input.mailPk,
                                    // it can be any action but not "EVENT_ACTION.DELETE"
                                    // so messages gets reduced as an updated and gets updated in the local database then
                                    Action: EVENT_ACTION.UPDATE
                                }],
                            },
                        ],
                        parentLogger: logger,
                    },
                ),
                // WARN: don't persist the "latestEventId" value in the case of single mail saving
                metadata: "skipPatching",
            };

            await persistDatabasePatch(
                providerApi,
                {...data, login: input.login},
                logger,
            );
        },
    };

    return endpoints;
};

export {buildDbPatch, buildDbPatchEndpoint};
