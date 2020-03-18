import {InjectionToken, Type} from "@angular/core";
import {Subject} from "rxjs";

import {LoginFieldContainer} from "src/shared/model/container";

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

export const FIRE_SYNCING_ITERATION$ = new Subject<LoginFieldContainer>();

export const DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN
    // eslint-disable-next-line max-len
    = new InjectionToken<Type<import("src/web/browser-window/app/_db-view/db-view-entry.component").DbViewEntryComponent>>("DbViewEntryComponent");
