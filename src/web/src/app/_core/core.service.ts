import {Injectable} from "@angular/core";

import {ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX, ACCOUNTS_CONFIG_ENTRY_URL_SEPARATOR} from "src/shared/constants";
import {ElectronContextLocations} from "src/shared/model/electron";
import {WebAccount} from "src/web/src/app/model";

@Injectable()
export class CoreService {
    private localEntryUrlPrefix = `${ACCOUNTS_CONFIG_ENTRY_URL_LOCAL_PREFIX}${ACCOUNTS_CONFIG_ENTRY_URL_SEPARATOR}`;

    constructor() {}

    parseEntryUrl(
        config: WebAccount["accountConfig"],
        {webClients}: ElectronContextLocations,
    ): { entryUrl: string; entryApiUrl: string; } {
        if (!config.entryUrl.startsWith(this.localEntryUrlPrefix)) {
            return {
                entryUrl: config.entryUrl,
                entryApiUrl: config.entryUrl,
            };
        }

        if (config.type !== "protonmail") {
            throw new Error(`Can't parse entry url for the unsupported account type: "${config.type}"`);
        }

        const entryApiUrl = config.entryUrl.split(ACCOUNTS_CONFIG_ENTRY_URL_SEPARATOR).pop();
        if (!entryApiUrl || !entryApiUrl.startsWith("https://")) {
            throw new Error(`Invalid "entryApiUrl" value: "${entryApiUrl}"`);
        }

        const entryUrl = webClients[config.type]
            .filter((webClient) => webClient.entryApiUrl === entryApiUrl)
            .map((webClient) => webClient.entryUrl)
            .pop();
        if (!entryUrl) {
            throw new Error(`Invalid "entryUrl" value: "${entryUrl}"`);
        }

        return {
            entryUrl,
            entryApiUrl,
        };

    }
}
