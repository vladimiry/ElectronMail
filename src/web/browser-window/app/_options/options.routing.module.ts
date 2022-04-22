import {NgModule} from "@angular/core";
import {RouterModule} from "@angular/router";
import type {Routes} from "@angular/router";

import {AccountEditComponent} from "./account-edit.component";
import {AccountsListComponent} from "./accounts-list.component";
import {BaseSettingsComponent} from "./base-settings.component";
import {DbMetadataResetRequestComponent} from "./db-metadata-reset-request.component";
import {LoginComponent} from "./login.component";
import {SettingsComponent} from "./settings.component";
import {SettingsConfigureGuard} from "./settings-configure.guard";
import {SettingsSetupComponent} from "./settings-setup.component";
import {StorageComponent} from "./storage.component";

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
                component: AccountsListComponent,
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
