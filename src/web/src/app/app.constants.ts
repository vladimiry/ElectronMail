import {InjectionToken} from "@angular/core";

import {DbAccountPk} from "src/shared/model/database";

export const ACCOUNTS_OUTLET = "accounts-outlet";

export const ACCOUNTS_PATH = "accounts";

export const SETTINGS_OUTLET = "settings-outlet";

export const SETTINGS_PATH = "settings";

export const NOTIFICATIONS_OUTLET = "notifications-outlet";

export const NOTIFICATIONS_PATH = "notifications";

export const ESC_KEY = "Escape";

export interface DbViewEntryComponentInterface {
    dbAccountPk: DbAccountPk;

    // tslint:disable-next-line:no-misused-new
    new(...args: any[]): DbViewEntryComponentInterface;

    setVisibility(value: boolean): void;
}

export const DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN = new InjectionToken<DbViewEntryComponentInterface>("DbViewEntryComponent");
