import {NgModule} from "@angular/core";
import {RouterModule, Routes} from "@angular/router";

import {AccountEditComponent} from "./account-edit.component";
import {AccountsComponent} from "./accounts.component";
import {BaseSettingsComponent} from "./base-settings.component";
import {LoginComponent} from "./login.component";
import {MigratingComponent} from "./migrating.component";
import {SettingsComponent} from "./settings.component";
import {SettingsConfigureGuard} from "./settings-configure.guard";
import {SettingsSetupComponent} from "./settings-setup.component";
import {StorageComponent} from "./storage.component";

export const PATHS = {
    migrating: "migrating",
};

// TODO define path names as constants and trigger navigation using them
const routes: Routes = [
    {
        path: PATHS.migrating,
        component: MigratingComponent,
    },
    {
        path: "login",
        component: LoginComponent,
    },
    {
        path: "settings-setup",
        component: SettingsSetupComponent,
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
