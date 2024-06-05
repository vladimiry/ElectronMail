import _logger from "electron-log";
import {keys} from "ts-transformer-keys";
import {URL} from "@cliqz/url-parser";

import {Context} from "src/electron-main/model";
import {curryFunctionMembers} from "src/shared/util";
import {filterProtonSessionApplyingCookies} from "src/electron-main/util";
import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import {processProtonCookieRecord} from "src/electron-main/util/proton-url";
import {resetSessionStorages, resolveInitializedAccountSession} from "src/electron-main/session";
import {resolvePrimaryDomainNameFromUrlHostname} from "src/shared/util/url";

const logger = curryFunctionMembers(_logger, __filename);

export const buildEndpoints = async (
    ctx: Context,
): Promise<
    Pick<
        IpcMainApiEndpoints,
        | "resolveSavedProtonClientSession"
        | "saveProtonSession"
        | "resetSavedProtonSession"
        | "applySavedProtonBackendSession"
        | "saveSessionStoragePatch"
        | "resolvedSavedSessionStoragePatch"
        | "resetProtonBackendSession"
    >
> => {
    const endpoints: Unpacked<ReturnType<typeof buildEndpoints>> = {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async resolveSavedProtonClientSession({login, apiEndpointOrigin}) {
            const savedSession = ctx.sessionStorage.getSession({login, apiEndpointOrigin});

            if (!savedSession) {
                return null;
            }

            const windowName = savedSession.window.name;

            if (!windowName) {
                return null;
            }

            return {sessionStorage: savedSession.sessionStorage, windowName};
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async saveProtonSession({login, apiEndpointOrigin, clientSession}) {
            const session = resolveInitializedAccountSession({login, entryUrl: apiEndpointOrigin});
            const requestUrlPrimaryDomainName = resolvePrimaryDomainNameFromUrlHostname(new URL(apiEndpointOrigin).hostname);
            const cookies = [...await session.cookies.get({})].map((cookie) => {
                return processProtonCookieRecord(cookie, {requestUrlPrimaryDomainName});
            });
            const dataToSave = {
                login,
                apiEndpointOrigin,
                session: {cookies, sessionStorage: clientSession.sessionStorage, window: {name: clientSession.windowName}},
            } as const;
            const {accessTokens, refreshTokens} = filterProtonSessionApplyingCookies(dataToSave.session.cookies);

            if (accessTokens.length > 1 || refreshTokens.length > 1) {
                const message = [
                    `The app refuses to save more than one "proton-session" cookies records set `,
                    `(${nameof(accessTokens)} count: ${accessTokens.length}, ${nameof(refreshTokens)} count: ${refreshTokens.length}).`,
                ].join("");
                logger.error(nameof.full(endpoints.saveProtonSession), message);
            }

            await ctx.sessionStorage.saveSession(dataToSave);
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async resetSavedProtonSession({login, apiEndpointOrigin}) {
            await ctx.sessionStorage.clearSession({login, apiEndpointOrigin});
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async applySavedProtonBackendSession({login, apiEndpointOrigin}) {
            const savedSession = ctx.sessionStorage.getSession({login, apiEndpointOrigin});

            // resetting the session before applying cookies from storage
            await endpoints.resetProtonBackendSession({login, apiEndpointOrigin});

            if (!savedSession) {
                return false;
            }

            const session = resolveInitializedAccountSession({login, entryUrl: apiEndpointOrigin});
            const cookies = filterProtonSessionApplyingCookies(savedSession.cookies);

            if (!cookies.accessTokens.length || !cookies.refreshTokens.length) {
                return false;
            }

            for (const cookieKey of keys<typeof cookies>()) {
                for (const cookie of cookies[cookieKey]) {
                    await session.cookies.set({...cookie, url: `${apiEndpointOrigin}/${cookie.path ?? ""}`});
                }
            }

            return true;
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async saveSessionStoragePatch({login, apiEndpointOrigin, sessionStorageItem: {__cookieStore__}}) {
            await ctx.sessionStorage.saveSessionStoragePatch({login, apiEndpointOrigin, __cookieStore__});
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async resolvedSavedSessionStoragePatch(arg) {
            return ctx.sessionStorage.getSessionStoragePatch(arg);
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async resetProtonBackendSession({login, apiEndpointOrigin}) {
            {
                const session = resolveInitializedAccountSession({login, entryUrl: apiEndpointOrigin});

                session._electron_mail_reset_counter_ ??= 0;
                session._electron_mail_reset_counter_++;

                if (
                    session._electron_mail_reset_counter_ < 2
                    || !(await session.cookies.get({})).length
                ) {
                    // skipping the "session reset" for the first call since the session is still fresh/pure
                    // https://github.com/vladimiry/ElectronMail/issues/447
                    return;
                }
            }

            await resetSessionStorages(ctx, {login, apiEndpointOrigin});
        },
    };

    return endpoints;
};
