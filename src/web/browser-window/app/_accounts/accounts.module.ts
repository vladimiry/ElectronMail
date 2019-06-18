import {BsDropdownModule} from "ngx-bootstrap/dropdown";
import {EffectsModule} from "@ngrx/effects";
import {NO_ERRORS_SCHEMA, NgModule} from "@angular/core";

import {AccountComponent} from "src/web/browser-window/app/_accounts/account.component";
import {AccountTitleComponent} from "src/web/browser-window/app/_accounts/account-title.component";
import {AccountsComponent} from "src/web/browser-window/app/_accounts/accounts.component";
import {AccountsEffects} from "src/web/browser-window/app/_accounts/accounts.effects";
import {AccountsGuard} from "src/web/browser-window/app/_accounts/accounts.guard";
import {AccountsRoutingModule} from "src/web/browser-window/app/_accounts/accounts.routing.module";
import {DbViewModuleResolve} from "src/web/browser-window/app/_accounts/db-view-module-resolve.service";
import {SharedModule} from "src/web/browser-window/app/_shared/shared.module";

@NgModule({
    imports: [
        BsDropdownModule,
        SharedModule,
        AccountsRoutingModule,
        EffectsModule.forFeature([AccountsEffects]),
    ],
    declarations: [
        AccountsComponent,
        AccountComponent,
        AccountTitleComponent,
    ],
    providers: [
        DbViewModuleResolve,
        AccountsGuard,
    ],
    schemas: [
        // TODO enable ELECTRON_SCHEMA instead of NO_ERRORS_SCHEMA
        NO_ERRORS_SCHEMA,
    ],
})
export class AccountsModule {}
