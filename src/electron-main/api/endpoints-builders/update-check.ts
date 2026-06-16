import {compareVersions} from "compare-versions";
import electronLog from "electron-log";
import fetch from "electron-fetch";
import {first} from "rxjs/operators";
import {inspect} from "util";
import {lastValueFrom} from "rxjs";
import type {Session} from "electron";

import {Context} from "src/electron-main/model";
import {createSessionUtil} from "src/electron-main/session";
import {curryFunctionMembers} from "src/shared/util";
import {IpcMainApiEndpoints, IpcMainServiceScan} from "src/shared/api/main-process";
import {PACKAGE_GITHUB_PROJECT_URL, PACKAGE_VERSION, UPDATE_CHECK_FETCH_TIMEOUT} from "src/shared/const";
import {PLATFORM} from "src/electron-main/constants";

const API_METHOD_NAME = "updateCheck" satisfies Extract<keyof IpcMainApiEndpoints, "updateCheck">;
const LOGGER = curryFunctionMembers(electronLog, __filename, API_METHOD_NAME);

const RELEASE_URL_PREFIX = `${PACKAGE_GITHUB_PROJECT_URL}/releases/tag`;
const TAG_NAME_FILTER_RE = /[^a-z0-9._-]/gi;
// ---------------------------------------------
// strip "-*" suffix (e.g., v5.3.7-2 => v5.3.7)
// ---------------------------------------------
// "semver/compareVersions" treats versions with "-*" as older than the base version
// but we make such versions resolved as the same/base versions to avoid "new version" popups
// since we don't want "new version v5.3.7 available"-like popup to show up to someone who already runs v5.3.7-2
const PACKAGE_VERSION_BASE_VERSION = PACKAGE_VERSION.split("-")[0]!;

const filterAssetName: (name: string) => boolean = ((): (name: string) => ReturnType<typeof filterAssetName> => {
    const keywordsRe: Readonly<Partial<Record<NodeJS.Platform, readonly string[]>>> = {
        darwin: ["-darwin", "-mac", "-osx", ".dmg$"],
        linux: ["-freebsd", "-linux", "-openbsd", ".AppImage$", ".deb$", ".freebsd$", ".pacman$", ".rpm$", ".snap$"],
        win32: [
            "-win",
            // "-win32",
            // "-windows",
            ".exe$",
        ],
    };
    const re = new RegExp((keywordsRe[PLATFORM] ?? [".*"]).join("|"), "i");
    let reLogged = false; // "update check" feature is optional, so let's not log inactive things
    return (name: string): ReturnType<typeof filterAssetName> => {
        if (!reLogged) {
            reLogged = true;
            LOGGER.verbose(nameof(filterAssetName), inspect({re}));
        }
        return re.test(name);
    };
})();

const resolveRequestData = ((): (ctx: Context) => Promise<Readonly<{session: Session; releasesUrl: string}>> => {
    let memoizedResult: ReturnType<typeof resolveRequestData> | undefined;
    return async (ctx: Context): ReturnType<typeof resolveRequestData> => {
        if (memoizedResult) return memoizedResult;
        const config = await lastValueFrom(ctx.config$.pipe(first()));
        const {updateCheck: {releasesUrl, proxyRules, proxyBypassRules}} = config;
        const session = createSessionUtil.create(`partition/main-process-endpoints/${API_METHOD_NAME}`);
        const proxyConfig = {proxyRules, proxyBypassRules};
        if (proxyConfig.proxyRules) await session.setProxy(proxyConfig);
        memoizedResult = Promise.resolve({session, releasesUrl});
        return memoizedResult;
    };
})();

export async function buildEndpoints(ctx: Context): Promise<Pick<IpcMainApiEndpoints, "updateCheck">> {
    const endpoints: Unpacked<ReturnType<typeof buildEndpoints>> = {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        updateCheck: (() => {
            return async (): Promise<IpcMainServiceScan["ApiImplReturns"]["updateCheck"]> => {
                const {releasesUrl, session} = await resolveRequestData(ctx);
                const response = await fetch(releasesUrl, {
                    method: "GET",
                    timeout: UPDATE_CHECK_FETCH_TIMEOUT,
                    useElectronNet: true,
                    useSessionCookies: false,
                    session,
                });

                if (!response.ok) {
                    // https://developer.github.com/v3/#rate-limiting
                    const rateLimitResetHeaderValue = Number(response.headers.get("X-RateLimit-Reset"));
                    const rateLimitError = response.status === 403 && !isNaN(rateLimitResetHeaderValue) && rateLimitResetHeaderValue > 0;
                    const errorMessageData = JSON.stringify({url: releasesUrl, status: response.status, statusText: response.statusText});
                    if (rateLimitError) {
                        // TODO consider enabling retry logic
                        LOGGER.error(new Error(`Update check failed (ignored as rate limit error): ${errorMessageData}`));
                        return {newReleaseItems: []};
                    }
                    throw new Error(`Update check failed: ${errorMessageData}`);
                }

                // TODO use some GitHub Rest API interaction library with built-in response format runtime validation
                //      rather than doing blind/dev-time-only casting
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const releases: ReadonlyArray<
                    {tag_name: string; published_at: string; prerelease: boolean; assets: Array<{name: string}>}
                > = await response.json();

                LOGGER.verbose(JSON.stringify({releasesCount: releases.length, PACKAGE_VERSION, PACKAGE_VERSION_BASE_VERSION, PLATFORM}));

                const newReleaseItems = releases
                    .filter(({prerelease}) => !prerelease)
                    .filter(({tag_name: tagName}) => compareVersions(tagName, PACKAGE_VERSION_BASE_VERSION) > 0)
                    .filter(({assets}) => assets.some(({name}) => filterAssetName(name)))
                    .sort((o1, o2) => compareVersions(o1.tag_name, o2.tag_name))
                    .reverse()
                    .map(({tag_name: tagName, published_at: date}) => {
                        const title = tagName.replace(TAG_NAME_FILTER_RE, "");
                        const tagNameValid = title === tagName;
                        // we don't use a raw "html_url" value but sanitize the url
                        const url = tagNameValid ? `${RELEASE_URL_PREFIX}/${tagName}` : undefined;
                        return {title, url, date} as const;
                    });

                LOGGER.verbose(JSON.stringify({newReleaseItems}, null, 2));

                return {newReleaseItems};
            };
        })(),
    };

    return endpoints;
}
