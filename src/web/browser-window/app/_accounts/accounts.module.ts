import {BsDropdownModule} from "ngx-bootstrap/dropdown";
import {EffectsModule} from "@ngrx/effects";
import {NO_ERRORS_SCHEMA, NgModule} from "@angular/core";

import {AccountComponent} from "./account.component";
import {AccountTitleComponent} from "./account-title.component";
import {AccountViewCalendarComponent} from "./account-view-calendar.component";
import {AccountViewPrimaryComponent} from "./account-view-primary.component";
import {AccountsComponent} from "./accounts.component";
import {AccountsEffects} from "./accounts.effects";
import {AccountsGuard} from "./accounts.guard";
import {AccountsRoutingModule} from "./accounts.routing.module";
import {AccountsService} from "./accounts.service";
import {DbViewModuleResolve} from "./db-view-module-resolve.service";
import {SharedModule} from "src/web/browser-window/app/_shared/shared.module";

@NgModule({
    imports: [
        BsDropdownModule,
        SharedModule,
        AccountsRoutingModule,
        EffectsModule.forFeature([AccountsEffects]),
    ],
    declarations: [
        AccountComponent,
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
