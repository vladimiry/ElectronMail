import {NgModule} from "@angular/core";
import {EffectsModule} from "@ngrx/effects";
import {CollapseModule} from "ngx-bootstrap/collapse";
import {PopoverModule} from "ngx-bootstrap/popover";

import {SharedModule} from "_web_app/+shared/shared.module";
import {OptionsRoutingModule} from "./options.routing.module";
import {OptionsService} from "./options.service";
import {SettingsConfigureGuard} from "./settings-configure.guard";
import {OptionsEffects} from "./options.effects";
import {LoginComponent} from "./login.component";
import {SettingsComponent} from "./settings.component";
import {SettingsSetupComponent} from "./settings-setup.component";
import {AccountEditComponent} from "./account-edit.component";
import {PasswordChangeComponent} from "./password-change.component";
import {AccountsComponent} from "./accounts.component";
import {KeepassAssociateComponent} from "./keepass-associate.component";
import {KeepassAssociateSettingsComponent} from "./keepass-associate-settings.component";
import {KeePassReferenceComponent} from "./keepass-reference.component";

@NgModule({
    imports: [
        CollapseModule,
        PopoverModule,
        SharedModule,
        OptionsRoutingModule,
        EffectsModule.forFeature([OptionsEffects]),
    ],
    providers: [
        SettingsConfigureGuard,
        OptionsService,
    ],
    declarations: [
        LoginComponent,
        SettingsComponent,
        SettingsSetupComponent,
        AccountEditComponent,
        PasswordChangeComponent,
        AccountsComponent,
        KeepassAssociateComponent,
        KeepassAssociateSettingsComponent,
        KeePassReferenceComponent,
    ],
})
export class OptionsModule {}
