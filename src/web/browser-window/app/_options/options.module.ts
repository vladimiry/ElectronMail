import {AccordionModule} from "ngx-bootstrap/accordion";
import {CollapseModule} from "ngx-bootstrap/collapse";
import {ColorPickerModule} from "ngx-color-picker";
import {DragulaModule} from "ng2-dragula";
import {EffectsModule} from "@ngrx/effects";
import {NgModule} from "@angular/core";
import {PopoverModule} from "ngx-bootstrap/popover";

import {AccountEditComponent} from "src/web/browser-window/app/_options/account-edit.component";
import {AccountsComponent} from "src/web/browser-window/app/_options/accounts.component";
import {BaseSettingsComponent} from "src/web/browser-window/app/_options/base-settings.component";
import {EncryptionPresetsComponent} from "src/web/browser-window/app/_options/encryption-presets.component";
import {LoginComponent} from "src/web/browser-window/app/_options/login.component";
import {OptionsEffects} from "src/web/browser-window/app/_options/options.effects";
import {OptionsRoutingModule} from "src/web/browser-window/app/_options/options.routing.module";
import {OptionsService} from "src/web/browser-window/app/_options/options.service";
import {SettingsComponent} from "src/web/browser-window/app/_options/settings.component";
import {SettingsConfigureGuard} from "src/web/browser-window/app/_options/settings-configure.guard";
import {SettingsSetupComponent} from "src/web/browser-window/app/_options/settings-setup.component";
import {SharedModule} from "src/web/browser-window/app/_shared/shared.module";
import {StorageComponent} from "src/web/browser-window/app/_options/storage.component";

@NgModule({
    imports: [
        CollapseModule,
        ColorPickerModule,
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
        AccountEditComponent,
        AccountsComponent,
        BaseSettingsComponent,
        EncryptionPresetsComponent,
        LoginComponent,
        SettingsComponent,
        SettingsSetupComponent,
        StorageComponent,
    ],
})
export class OptionsModule {}
