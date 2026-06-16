import {compareVersions} from "compare-versions";
import electronLog from "electron-log";
import fetch from "electron-fetch";
import {first} from "rxjs/operators";
import {inspect} from "util";
import {lastValueFrom} from "rxjs";

import {Context} from "src/electron-main/model";
import {createSessionUtil} from "src/electron-main/session";
import {curryFunctionMembers} from "src/shared/util";
import {IpcMainApiEndpoints, IpcMainServiceScan} from "src/shared/api/main-process";
import {PACKAGE_GITHUB_PROJECT_URL, PACKAGE_VERSION, UPDATE_CHECK_FETCH_TIMEOUT} from "src/shared/const";
import {PLATFORM} from "src/electron-main/constants";

const logger = curryFunctionMembers(electronLog, __filename);

export async function buildEndpoints(ctx: Context): Promise<Pick<IpcMainApiEndpoints, "updateCheck">> {
    const endpoints: Unpacked<ReturnType<typeof buildEndpoints>> = {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        updateCheck: (() => {
            const releasesUrlPrefix = `${PACKAGE_GITHUB_PROJECT_URL}/releases/tag`;
            const tagNameFilterRe = /[^a-z0-9._-]/gi;
            const filterAssetName: (name: string) => boolean = ((): (name: string) => boolean => {
                const assetNameRegExpKeywords: Readonly<Partial<Record<NodeJS.Platform, readonly string[]>>> = {
                    darwin: ["-darwin", "-mac", "-osx", ".dmg$"],
                    linux: ["-freebsd", "-linux", "-openbsd", ".AppImage$", ".deb$", ".freebsd$", ".pacman$", ".rpm$", ".snap$"],
                    win32: [
                        "-win",
                        // "-win32",
                        // "-windows",
                        ".exe$",
                    ],
                };
                const assetNameRegExp = new RegExp(
                    (assetNameRegExpKeywords[PLATFORM]
                        // any file name for any platform other than darwin/linux/win32
                        || [".*"]).join("|"),
                    "i",
                );
                let assetNameRegExpLogged = false;

                return (name: string): boolean => {
                    if (!assetNameRegExpLogged) {
                        assetNameRegExpLogged = true;
                        logger.verbose(nameof(endpoints.updateCheck), inspect({assetNameRegExp}));
                    }
                    return assetNameRegExp.test(name);
                };
            })();
            let session: import("electron").Session | undefined;

            return async (): Promise<IpcMainServiceScan["ApiImplReturns"]["updateCheck"]> => {
                const config = await lastValueFrom(ctx.config$.pipe(first()));
                const {updateCheck: {releasesUrl, proxyRules, proxyBypassRules}} = config;
                const response = await fetch(releasesUrl, {
                    method: "GET",
                    timeout: UPDATE_CHECK_FETCH_TIMEOUT,
                    useElectronNet: true,
                    useSessionCookies: false,
                    session: session ?? await (async () => {
                        session = createSessionUtil.create(`partition/main-process-endpoints/${nameof(endpoints.updateCheck)}`);
                        const proxyConfig: Readonly<Parameters<typeof session.setProxy>[0]> = {proxyRules, proxyBypassRules};
                        if (proxyConfig.proxyRules) {
                            await session.setProxy(proxyConfig);
                        }
                        return session;
                    })(),
                });

                if (!response.ok) {
                    // https://developer.github.com/v3/#rate-limiting
                    const rateLimitResetHeaderValue = Number(response.headers.get("X-RateLimit-Reset"));
                    const rateLimitError = response.status === 403
                        && !isNaN(rateLimitResetHeaderValue)
                        && rateLimitResetHeaderValue > 0;
                    const errorMessageData = JSON.stringify({url: releasesUrl, status: response.status, statusText: response.statusText});

                    if (rateLimitError) {
                        // TODO consider enabling retry logic
                        logger.error(
                            nameof(endpoints.updateCheck),
                            new Error(`Update check failed (ignored as rate limit error): ${errorMessageData}`),
                        );
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

                logger.verbose(nameof(endpoints.updateCheck), JSON.stringify({releasesCount: releases.length, PACKAGE_VERSION, PLATFORM}));

                const newReleaseItems = releases.filter(({prerelease}) => !prerelease).filter(({tag_name: tagName}) =>
                    compareVersions(tagName, PACKAGE_VERSION) > 0
                ).filter(({assets}) => assets.some(({name}) => filterAssetName(name))).sort((o1, o2) =>
                    compareVersions(o1.tag_name, o2.tag_name)
                ).reverse().map(({tag_name: tagName, published_at: date}) => {
                    const title = tagName.replace(tagNameFilterRe, "");
                    const tagNameValid = title === tagName;
                    // we don't use a raw "html_url" value but sanitize the url
                    const url = tagNameValid
                        ? `${releasesUrlPrefix}/${tagName}`
                        : undefined;
                    return {title, url, date} as const;
                });

                logger.verbose(nameof(endpoints.updateCheck), JSON.stringify({newReleaseItems}, null, 2));

                return {newReleaseItems};
            };
        })(),
    };

    return endpoints;
}
