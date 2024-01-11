import {BsDropdownModule} from "ngx-bootstrap/dropdown";
import {EffectsModule} from "@ngrx/effects";
import {NgModule, NO_ERRORS_SCHEMA} from "@angular/core";

import {AccountsCalendarNsEffects} from "./effects/accounts-calendar-ns.effects";
import {AccountsComponent} from "./accounts.component";
import {AccountsDbSyncingEffects} from "./effects/accounts-db-syncing.effects";
import {AccountsEffects} from "./effects/accounts.effects";
import {AccountsGuard} from "./accounts.guard";
import {AccountsPrimaryNsEffects} from "./effects/accounts-primary-ns.effects";
import {AccountsRoutingModule} from "./accounts.routing.module";
import {AccountsService} from "./accounts.service";
import {AccountTitleComponent} from "./account-title.component";
import {AccountViewCalendarComponent} from "./account-view-calendar.component";
import {AccountViewComponent} from "./account-view.component";
import {AccountViewPrimaryComponent} from "./account-view-primary.component";
import {DbViewModuleResolve} from "./db-view-module-resolve.service";
import {SharedModule} from "src/web/browser-window/app/_shared/shared.module";

@NgModule({
    imports: [
        BsDropdownModule,
        SharedModule,
        AccountsRoutingModule,
        EffectsModule.forFeature([
            AccountsCalendarNsEffects,
            AccountsDbSyncingEffects,
            AccountsEffects,
            AccountsPrimaryNsEffects,
        ]),
    ],
    declarations: [
        AccountViewComponent,
        AccountsComponent,
        AccountTitleComponent,
        AccountViewCalendarComponent,
        AccountViewPrimaryComponent,
    ],
    providers: [
        AccountsGuard,
        AccountsService,
        DbViewModuleResolve,
    ],
    schemas: [
        // TODO enable ELECTRON_SCHEMA instead of NO_ERRORS_SCHEMA
        NO_ERRORS_SCHEMA,
    ],
})
export class AccountsModule {}
