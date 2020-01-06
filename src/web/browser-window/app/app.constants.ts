import {InjectionToken} from "@angular/core";
import {Subject} from "rxjs";

import {AccountTypeAndLoginFieldContainer} from "src/shared/model/container";
import {DbAccountPk} from "src/shared/model/database";

export const STUB_OUTLET = "stub-outlet";

export const STUB_PATH = "stub";

export const ACCOUNTS_OUTLET = "accounts-outlet";

export const ACCOUNTS_PATH = "accounts";

export const SETTINGS_OUTLET = "settings-outlet";

export const SETTINGS_PATH = "settings";

export const NOTIFICATIONS_OUTLET = "notifications-outlet";

export const NOTIFICATIONS_PATH = "notifications";

export const ESC_KEY = "Escape";

export const ROUTER_DATA_OUTLET_PROP = "ROUTER_DATA_OUTLET_PROP";

export const FIRE_SYNCING_ITERATION$ = new Subject<AccountTypeAndLoginFieldContainer>();

export interface DbViewEntryComponentInterface {
    dbAccountPk: DbAccountPk;

    // tslint:disable-next-line:no-misused-new
    new(...args: any[]): DbViewEntryComponentInterface;
}

export const DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN = new InjectionToken<DbViewEntryComponentInterface>("DbViewEntryComponent");
