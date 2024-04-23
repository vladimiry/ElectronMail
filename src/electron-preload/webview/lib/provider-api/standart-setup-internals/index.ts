import {distinctUntilChanged, map} from "rxjs/operators";
import {Observable} from "rxjs";

import {curryFunctionMembers} from "src/shared/util";
import {Logger} from "src/shared/model/common";
import {resolveStandardSetupStandardSetupProviderInternals} from "./internals";
import {StandardSetupPublicScope} from "src/electron-preload/webview/lib/provider-api/standart-setup-internals/model";

export * from "./internals";
export * from "./model";

export const resolveStandardSetupPublicApi = async (
    _logger: Logger,
): Promise<
    {
        readonly httpApi$: Observable<StandardSetupPublicScope["httpApi"]>;
        readonly authentication$: Observable<StandardSetupPublicScope["authentication"]>;
        readonly cache$: Observable<StandardSetupPublicScope["cache"]>;
        readonly history$: Observable<StandardSetupPublicScope["history"]>;
    }
> => {
    const logger = curryFunctionMembers(_logger, nameof(resolveStandardSetupPublicApi));

    logger.info("init");

    const internals = await resolveStandardSetupStandardSetupProviderInternals(logger);
    const scope$ = internals["../../packages/components/containers/app/StandardPrivateApp.tsx"].value$.pipe(
        map(({publicScope}) => publicScope),
        distinctUntilChanged(),
    );

    return { // TODO set race-based timeout when members of this object get accessed/resolved
        httpApi$: scope$.pipe(map(({httpApi}) => httpApi), distinctUntilChanged()),
        authentication$: scope$.pipe(map(({authentication}) => authentication), distinctUntilChanged()),
        cache$: scope$.pipe(map(({cache}) => cache), distinctUntilChanged()),
        history$: scope$.pipe(map(({history}) => history), distinctUntilChanged()),
    } as const;
};
