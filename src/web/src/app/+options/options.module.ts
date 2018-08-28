import {AccordionModule} from "ngx-bootstrap/accordion";
import {CollapseModule} from "ngx-bootstrap/collapse";
import {DragulaModule} from "ng2-dragula";
import {EffectsModule} from "@ngrx/effects";
import {NgModule} from "@angular/core";
import {PopoverModule} from "ngx-bootstrap/popover";

import {AccountEditComponent} from "./account-edit.component";
import {AccountsComponent} from "./accounts.component";
import {BaseSettingsComponent} from "./base-settings.component";
import {EncryptionPresetsComponent} from "./encryption-presets.component";
import {KeePassReferenceComponent} from "./keepass-reference.component";
import {KeepassAssociateComponent} from "./keepass-associate.component";
import {KeepassAssociateSettingsComponent} from "./keepass-associate-settings.component";
import {LoginComponent} from "./login.component";
import {OptionsEffects} from "./options.effects";
import {OptionsRoutingModule} from "./options.routing.module";
import {OptionsService} from "./options.service";
import {SettingsComponent} from "./settings.component";
import {SettingsConfigureGuard} from "./settings-configure.guard";
import {SettingsSetupComponent} from "./settings-setup.component";
import {SharedModule} from "src/web/src/app/+shared/shared.module";
import {StorageComponent} from "./storage.component";

@NgModule({
    imports: [
        CollapseModule,
        AccordionModule,
        PopoverModule,
        DragulaModule,
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
        AccountsComponent,
        KeepassAssociateComponent,
        KeepassAssociateSettingsComponent,
        KeePassReferenceComponent,
        BaseSettingsComponent,
        EncryptionPresetsComponent,
        StorageComponent,
    ],
})
export class OptionsModule {}
