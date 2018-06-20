import {NgModule, NO_ERRORS_SCHEMA} from "@angular/core";
import {EffectsModule} from "@ngrx/effects";
import {BsDropdownModule} from "ngx-bootstrap/dropdown";

import {SharedModule} from "_web_src/app/+shared/shared.module";
import {AccountsRoutingModule} from "./accounts.routing.module";
import {AccountsComponent} from "./accounts.component";
import {AccountComponent} from "./account.component";
import {AccountTitleComponent} from "./account-title.component";
import {AccountsEffects} from "./accounts.effects";
import {AccountsGuard} from "./accounts.guard";

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
        AccountsGuard,
    ],
    schemas: [
        // TODO enable ELECTRON_SCHEMA instead of NO_ERRORS_SCHEMA
        NO_ERRORS_SCHEMA,
    ],
})
export class AccountsModule {}
