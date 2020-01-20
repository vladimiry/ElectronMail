import {concatMap} from "rxjs/operators";
import {from, race, throwError, timer} from "rxjs";
import {pick} from "remeda";

import {Context} from "src/electron-main/model";
import {IpcMainApiEndpoints} from "src/shared/api/main";
import {ONE_SECOND_MS} from "src/shared/constants";
import {resolveInitialisedSession} from "src/electron-main/session";

// TODO enable minimal logging
// const logger = curryFunctionMembers(electronLog, "[electron-main/api/endpoints-builders/proton-session]");

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<IpcMainApiEndpoints,
    | "resolveSavedProtonClientSession"
    | "saveProtonSession"
    | "resetSavedProtonSession"
    | "applySavedProtonBackendSession"
    | "resetProtonBackendSession">> {
    const endpoints: Unpacked<ReturnType<typeof buildEndpoints>> = {
        async resolveSavedProtonClientSession({login, apiEndpointOrigin}) {
            const savedSession = ctx.sessionStorage.getSession({login, apiEndpointOrigin});

            if (!savedSession) {
                return null;
            }

            const windowName = savedSession.window.name;

            if (!windowName) {
                return null;
            }

            return {
                sessionStorage: savedSession.sessionStorage,
                windowName,
            };
        },

        async saveProtonSession({login, apiEndpointOrigin, clientSession}) {
            const session = resolveInitialisedSession({login});
            const data = {
                login,
                apiEndpointOrigin,
                session: {
                    cookies: await session.cookies.get({}),
                    sessionStorage: clientSession.sessionStorage,
                    window: {
                        name: clientSession.windowName,
                    },
                },
            } as const;

            await ctx.sessionStorage.saveSession(data);
        },

        async resetSavedProtonSession({login, apiEndpointOrigin}) {
            await ctx.sessionStorage.clearSession({login, apiEndpointOrigin});
        },

        async applySavedProtonBackendSession({login, apiEndpointOrigin}) {
            const savedSession = ctx.sessionStorage.getSession({login, apiEndpointOrigin});

            // resetting the session before applying cookies from storage
            await endpoints.resetProtonBackendSession({login});

            if (!savedSession) {
                return false;
            }

            const savedCookies = pickTokens(savedSession.cookies);

            if (!savedCookies.accessToken || !savedCookies.refreshToken) {
                return false;
            }

            const session = resolveInitialisedSession({login});

            await Promise.all([
                session.cookies.set({
                    ...pickCookiePropsToSet(savedCookies.accessToken),
                    url: `${apiEndpointOrigin}${savedCookies.accessToken.path}`,
                }),
                session.cookies.set({
                    ...pickCookiePropsToSet(savedCookies.refreshToken),
                    url: `${apiEndpointOrigin}${savedCookies.refreshToken.path}`,
                }),
            ]);

            return true;
        },

        async resetProtonBackendSession({login}) {
            const session = resolveInitialisedSession({login});
            const timeoutMs = ONE_SECOND_MS * 3;

            await race(
                from(
                    session.clearStorageData(),
                ),
                timer(timeoutMs).pipe(
                    concatMap(() => throwError(new Error(`Failed clear the session in ${timeoutMs}ms`))),
                ),
            ).toPromise();
        },
    };

    return endpoints;
}

function pickTokens<T extends { name: string }>(items: T[]): Readonly<{ accessToken?: T; refreshToken?: T; }> {
    return {
        accessToken: items.find(({name}) => name.toUpperCase().startsWith("AUTH-")),
        refreshToken: items.find(({name}) => name.toUpperCase().startsWith("REFRESH-")),
    } as const;
}

function pickCookiePropsToSet(cookie: Electron.Cookie) {
    return pick(cookie, ["httpOnly", "name", "path", "secure", "value"]);
}
