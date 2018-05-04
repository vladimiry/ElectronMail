import {NgModule, NO_ERRORS_SCHEMA} from "@angular/core";
import {EffectsModule} from "@ngrx/effects";

import {SharedModule} from "_web_app/+shared/shared.module";
import {AccountsRoutingModule} from "./accounts.routing.module";
import {AccountService} from "./account.service";
import {AccountsComponent} from "./accounts.component";
import {AccountComponent} from "./account.component";
import {AccountTitleComponent} from "./account-title.component";
import {AccountsEffects} from "./accounts.effects";
import {AccountsGuard} from "./accounts.guard";

@NgModule({
    imports: [
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
        AccountService,
    ],
    schemas: [
        // TODO enable ELECTRON_SCHEMA instead of NO_ERRORS_SCHEMA
        NO_ERRORS_SCHEMA,
    ],
})
export class AccountsModule {}
