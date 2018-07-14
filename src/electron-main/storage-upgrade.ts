import compareVersions from "compare-versions";

import {APP_VERSION} from "src/shared/constants";
import {Config, Settings} from "src/shared/model/options";

const CONFIG_UPGRADES: Record<string, (config: Config) => void> = {
    "1.1.0": (config) => {
        if ("appVersion" in config) {
            delete (config as any).appVersion;
        }
    },
};
const SETTINGS_UPGRADES: Record<string, (settings: Settings) => void> = {};

export function upgradeConfig(config: Config): boolean {
    return upgrade(config, CONFIG_UPGRADES);
}

export function upgradeSettings(settings: Settings): boolean {
    return upgrade(settings, SETTINGS_UPGRADES);
}

function upgrade<T extends Config | Settings>(entity: T, upgrades: Record<string, (entity: T) => void>): boolean {
    const input = JSON.stringify(entity);

    Object
        .keys(upgrades)
        .filter((versionUpgradeFrom) => compareVersions(versionUpgradeFrom, APP_VERSION) <= 0)
        .sort(compareVersions)
        .forEach((version) => upgrades[version](entity));

    return JSON.stringify(entity) !== input;
}
