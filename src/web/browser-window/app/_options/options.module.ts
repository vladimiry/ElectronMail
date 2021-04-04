import {AccordionModule} from "ngx-bootstrap/accordion";
import {CollapseModule} from "ngx-bootstrap/collapse";
import {ColorPickerModule} from "ngx-color-picker";
import {DragDropModule} from "@angular/cdk/drag-drop";
import {EffectsModule} from "@ngrx/effects";
import {NgModule} from "@angular/core";
import {PopoverModule} from "ngx-bootstrap/popover";

import {AccountEditComponent} from "./account-edit.component";
import {AccountsListComponent} from "./accounts-list.component";
import {BaseSettingsComponent} from "./base-settings.component";
import {DbMetadataResetRequestComponent} from "./db-metadata-reset-request.component";
import {EncryptionPresetsComponent} from "./encryption-presets.component";
import {LoginComponent} from "./login.component";
import {OptionsEffects} from "./options.effects";
import {OptionsRoutingModule} from "./options.routing.module";
import {OptionsService} from "./options.service";
import {SavePasswordLabelComponent} from "./save-password-label.component";
import {SettingsComponent} from "./settings.component";
import {SettingsConfigureGuard} from "./settings-configure.guard";
import {SettingsSetupComponent} from "./settings-setup.component";
import {SharedModule} from "src/web/browser-window/app/_shared/shared.module";
import {StorageComponent} from "./storage.component";

@NgModule({
    imports: [
        AccordionModule,
        CollapseModule,
        ColorPickerModule,
        DragDropModule,
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
        AccountEditComponent,
        AccountsListComponent,
        BaseSettingsComponent,
        DbMetadataResetRequestComponent,
        EncryptionPresetsComponent,
        LoginComponent,
        SavePasswordLabelComponent,
        SettingsComponent,
        SettingsSetupComponent,
        StorageComponent,
    ],
})
export class OptionsModule {}
