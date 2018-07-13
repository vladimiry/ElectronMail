import compareVersions from "compare-versions";

import {APP_VERSION} from "src/shared/constants";
import {Config, Settings} from "src/shared/model/options";

const CONFIG_UPGRADES: Record<string, (config: any) => void> = {};
const SETTINGS_UPGRADES: Record<string, (settings: any) => void> = {};

export function upgradeConfig(config: Config): boolean {
    return upgrade(config, CONFIG_UPGRADES);
}

export function upgradeSettings(settings: Settings): boolean {
    return upgrade(settings, SETTINGS_UPGRADES);
}

function upgrade(entity: Config | Settings, upgrades: Record<string, (config: any) => void>): boolean {
    const input = JSON.stringify(entity);

    Object
        .keys(upgrades)
        .filter((version) => compareVersions(version, APP_VERSION) <= 0)
        .sort(compareVersions)
        .forEach((version) => upgrades[version](entity));

    return JSON.stringify(entity) !== input;
}
