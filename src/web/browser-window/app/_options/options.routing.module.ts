import {NgModule} from "@angular/core";
import {RouterModule, Routes} from "@angular/router";

import {AccountEditComponent} from "src/web/browser-window/app/_options/account-edit.component";
import {AccountsComponent} from "src/web/browser-window/app/_options/accounts.component";
import {BaseSettingsComponent} from "src/web/browser-window/app/_options/base-settings.component";
import {DbMetadataResetRequestComponent} from "src/web/browser-window/app/_options/db-metadata-reset-request.component";
import {LoginComponent} from "src/web/browser-window/app/_options/login.component";
import {SettingsComponent} from "src/web/browser-window/app/_options/settings.component";
import {SettingsConfigureGuard} from "src/web/browser-window/app/_options/settings-configure.guard";
import {SettingsSetupComponent} from "src/web/browser-window/app/_options/settings-setup.component";
import {StorageComponent} from "src/web/browser-window/app/_options/storage.component";

// TODO define path names as constants and trigger navigation using them
const routes: Routes = [
    {
        path: "login",
        component: LoginComponent,
    },
    {
        path: "settings-setup",
        component: SettingsSetupComponent,
    },
    {
        path: "db-metadata-reset-request",
        component: DbMetadataResetRequestComponent,
    },
    {
        path: "",
        component: SettingsComponent,
        canActivate: [SettingsConfigureGuard],
        children: [
            {
                path: "",
                redirectTo: "accounts",
                pathMatch: "full",
            },
            {
                path: "accounts",
                component: AccountsComponent,
            },
            {
                path: "account-edit",
                component: AccountEditComponent,
            },
            {
                path: "account-edit/:login",
                component: AccountEditComponent,
            },
            {
                path: "general",
                component: BaseSettingsComponent,
            },
            {
                path: "storage",
                component: StorageComponent,
            },
        ],
    },
];

@NgModule({
    imports: [
        RouterModule.forChild(routes),
    ],
    exports: [
        RouterModule,
    ],
})
export class OptionsRoutingModule {}
