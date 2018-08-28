import {BsDropdownModule} from "ngx-bootstrap/dropdown";
import {EffectsModule} from "@ngrx/effects";
import {NO_ERRORS_SCHEMA, NgModule} from "@angular/core";

import {AccountComponent} from "./account.component";
import {AccountTitleComponent} from "./account-title.component";
import {AccountsComponent} from "./accounts.component";
import {AccountsEffects} from "./accounts.effects";
import {AccountsGuard} from "./accounts.guard";
import {AccountsRoutingModule} from "./accounts.routing.module";
import {KeePassRequestComponent} from "./keepass-request.component";
import {SharedModule} from "src/web/src/app/+shared/shared.module";

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
        KeePassRequestComponent,
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
