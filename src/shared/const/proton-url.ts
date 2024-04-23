import {URL} from "@cliqz/url-parser";

import {EntryUrlItem} from "src/shared/model/common";
import {PROVIDER_REPO_MAP} from "src/shared/const/proton-apps";
import {resolvePrimaryDomainNameFromUrlHostname} from "src/shared/util/url";

// @deprecated since switching to the packaged web clients
export const PROTON_API_ENTRY_VALUE_PREFIX = "local:::";

// WARN the value also used for patching the web clients
export const PROTON_API_URL_PLACEHOLDER = "___ELECTRON_MAIL_PROTON_API_ENTRY_URL_PLACEHOLDER___";

// WARN the value also used for patching the web clients
export const PROTON_SUPPRESS_UPSELL_ADS_PLACEHOLDER = "___ELECTRON_MAIL_PROTON_SUPPRESS_UPSELL_ADS_PLACEHOLDER___";

export const PROTON_API_ENTRY_PRIMARY_VALUE = "https://mail.proton.me";

export const PROTON_API_ENTRY_PRIMARY_DOMAIN_NAME = resolvePrimaryDomainNameFromUrlHostname(
    new URL(PROTON_API_ENTRY_PRIMARY_VALUE).hostname,
);

// @deprecated Tor v2 address will be retired by October 15, 2021
export const PROTON_API_ENTRY_TOR_V2_VALUE = "https://protonirockerxow.onion";

// @deprecated on 2022-04-20, see https://github.com/ProtonMail/WebClients/issues/271#issuecomment-1104398459
export const PROTON_API_ENTRY_TOR_V3_VALUE = "https://protonmailrmez3lotccipshtkleegetolb73fuirgj7r4o4vfu7ozyd.onion";

export const PROTON_API_ENTRY_TOR_V4_VALUE = "https://mail.protonmailrmez3lotccipshtkleegetolb73fuirgj7r4o4vfu7ozyd.onion";

// @deprecated since v5.0.0
export const PROTON_API_ENTRY_PROTONMAIL_COM_VALUE = "https://mail.protonmail.com";

// @deprecated since v5.0.0
export const PROTON_API_ENTRY_PROTONMAIL_CH_VALUE = "https://app.protonmail.ch";

export const PROTON_API_ENTRY_RECORDS: DeepReadonly<EntryUrlItem[]> = [{
    value: PROTON_API_ENTRY_PRIMARY_VALUE,
    title: PROTON_API_ENTRY_PRIMARY_DOMAIN_NAME,
}, {value: PROTON_API_ENTRY_TOR_V4_VALUE, title: "Tor version 3 address"}];

export const PROTON_API_ENTRY_URLS = PROTON_API_ENTRY_RECORDS.map(({value: url}) => url);

export const PROTON_API_SUBDOMAINS = [...Object.values(PROVIDER_REPO_MAP).map(({apiSubdomain}) => apiSubdomain)] as const;

export const PROTON_APP_MAIL_LOGIN_PATHNAME = "/login";
