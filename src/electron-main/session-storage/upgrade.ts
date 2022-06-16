import _logger from "electron-log";
import {mapKeys} from "remeda";
import {URL} from "@cliqz/url-parser";

import {AccountPersistentSessionBundle} from "src/shared/model/account";
import {curryFunctionMembers} from "src/shared/util";
import {emptySessionStorageEntity} from "./util";
import {LOCAL_WEBCLIENT_DIR_NAME} from "src/shared/const";
import {processProtonCookieRecord} from "src/electron-main/util/proton-url";
import {
    PROTON_API_ENTRY_PRIMARY_VALUE, PROTON_API_ENTRY_PROTONMAIL_CH_VALUE, PROTON_API_ENTRY_PROTONMAIL_COM_VALUE,
    PROTON_API_ENTRY_TOR_V2_VALUE, PROTON_API_ENTRY_TOR_V3_VALUE, PROTON_API_ENTRY_TOR_V4_VALUE,
} from "src/shared/const/proton-url";
import {resolvePrimaryDomainNameFromUrlHostname} from "src/shared/util/url";
import {SESSION_STORAGE_VERSION} from "./const";
import {SessionStorageModel} from "./model";

const logger = curryFunctionMembers(_logger, __filename);

const hasRecord = (
    {apiEndpointOrigin}: { apiEndpointOrigin: string },
    bundle?: AccountPersistentSessionBundle,
): boolean => {
    return Boolean(
        bundle?.[apiEndpointOrigin],
    );
};

const changeEntryUrls = (
    {instance, sessionStoragePatchInstance}: SessionStorageModel,
    {from, to, justRemove}: { from: string, to: string, justRemove?: string },
): void => {
    for (const mappedByEntryUrl of [...Object.values(instance), ...Object.values(sessionStoragePatchInstance)]) {
        if (!mappedByEntryUrl) {
            return;
        }
        const item = mappedByEntryUrl[from];
        if (item) {
            // WARN: not overwriting "to" record if it exists (if this logic gets reapplied for newer versions)
            if (!mappedByEntryUrl[to]) {
                mappedByEntryUrl[to] = item;
            }
            delete mappedByEntryUrl[from];
        }
        if (justRemove) {
            delete mappedByEntryUrl[justRemove];
        }
    }
};

export const upgradeSessionStorage = (
    entity: SessionStorageModel,
): boolean => {
    const entityVersion = typeof entity.version !== "number" || isNaN(entity.version)
        ? 0
        : entity.version;

    if (entityVersion === SESSION_STORAGE_VERSION) {
        return false;
    }
    if (entityVersion > SESSION_STORAGE_VERSION) {
        throw new Error(`Invalid session storage ${JSON.stringify({entityVersion})} value`);
    }
    logger.verbose(`upgrading from ${JSON.stringify({entityVersion})}`);

    if (entityVersion < 1) {
        entity = {
            ...emptySessionStorageEntity(),
            instance: entity as unknown as SessionStorageModel["instance"],
        };
    }
    if (entityVersion < 3) {
        entity.sessionStoragePatchInstance ??= {};
    }
    if (entityVersion < 5) {
        // replaying v2 upgrade to apply foxed version (dropping "from" record)
        changeEntryUrls(entity, {from: PROTON_API_ENTRY_TOR_V2_VALUE, to: PROTON_API_ENTRY_TOR_V3_VALUE});
        // replaying v2 upgrade to apply foxed version (dropping "from" record)
        changeEntryUrls(entity, {from: PROTON_API_ENTRY_TOR_V3_VALUE, to: PROTON_API_ENTRY_TOR_V4_VALUE});

        for (const bundle of Object.values(entity.instance)) {
            // handle data transferring from https://mail.protonmail.com record is a preferred choice
            if (hasRecord({apiEndpointOrigin: PROTON_API_ENTRY_PROTONMAIL_COM_VALUE}, bundle)) {
                changeEntryUrls(
                    entity,
                    {
                        from: PROTON_API_ENTRY_PROTONMAIL_COM_VALUE,
                        to: PROTON_API_ENTRY_PRIMARY_VALUE,
                        // possibly existing https://app.protonmail.ch related data gets dropped here
                        // since two sessions can't be merged into a single primary url (currently the https://mail.proton.me value)
                        justRemove: PROTON_API_ENTRY_PROTONMAIL_CH_VALUE,
                    },
                );
            } else {
                // just transferring possibly existing https://app.protonmail.ch related data
                changeEntryUrls(entity, {from: PROTON_API_ENTRY_PROTONMAIL_CH_VALUE, to: PROTON_API_ENTRY_PRIMARY_VALUE});
            }
        }

        // handle server-side cookies
        for (const mappedByEntryUrlRecord of Object.values(entity.instance)) {
            if (!mappedByEntryUrlRecord) continue;
            for (const [key, value] of Object.entries(mappedByEntryUrlRecord)) {
                const requestUrlPrimaryDomainName = resolvePrimaryDomainNameFromUrlHostname(new URL(key).hostname);
                if (!value) continue;
                for (const cookie of value.cookies) {
                    processProtonCookieRecord(cookie, {requestUrlPrimaryDomainName});
                }
            }
        }

        // handle client-side cookies
        for (const mappedByEntryUrlRecord of Object.values(entity.sessionStoragePatchInstance)) {
            if (!mappedByEntryUrlRecord) continue;
            for (const finalRecord of Object.values(mappedByEntryUrlRecord)) {
                if (!finalRecord) continue;
                type Properties = Required<Exclude<ConstructorParameters<(typeof import("tough-cookie"))["Cookie"]>[0], undefined>>;
                type types = Pick<Properties, "domain" | "path" | "key">;
                finalRecord.__cookieStore__ = JSON.stringify(
                    mapKeys(
                        JSON.parse(finalRecord.__cookieStore__) as (
                            Record<types["domain"],
                                Record<types["path"],
                                    Record<types["key"], Properties>>>
                            ),
                        ((...[/* key/domain */, v1]) => {
                            for (const v2 of Object.values(v1)) {
                                for (const v3 of Object.values(v2)) {
                                    if (v3.domain) {
                                        v3.domain = LOCAL_WEBCLIENT_DIR_NAME;
                                    }
                                }
                            }
                            return LOCAL_WEBCLIENT_DIR_NAME;
                        }),
                    ),
                );
            }
        }
    }

    return true;
};
