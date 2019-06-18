import {NgModule} from "@angular/core";
import {RouterModule, Routes} from "@angular/router";

import {AccountsComponent} from "src/web/browser-window/app/_accounts/accounts.component";
import {AccountsGuard} from "src/web/browser-window/app/_accounts/accounts.guard";

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
