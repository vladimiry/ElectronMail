import {NgModule} from "@angular/core";
import {RouterModule} from "@angular/router";
import type {Routes} from "@angular/router";

import {AccountsComponent} from "./accounts.component";
import {AccountsGuard} from "./accounts.guard";

export const routes: Routes = [
    {
        path: "",
        component: AccountsComponent,
        canActivate: [AccountsGuard],
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
export class AccountsRoutingModule {}
