import {NgModule} from "@angular/core";
import {PreloadAllModules, RouterModule, Routes} from "@angular/router";

import {ACCOUNTS_OUTLET, ACCOUNTS_PATH, ERRORS_OUTLET, ERRORS_PATH, SETTINGS_OUTLET, SETTINGS_PATH} from "./app.constants";
import {ErrorListComponent} from "./components/error-list.component";
import {RouterProxyComponent} from "./components/router-proxy.component";

// TODO consider getting rid of the lazy loading, it's not really needed for the Electron application
const routes: Routes = [
    {
        path: "",
        redirectTo: `/(${ACCOUNTS_OUTLET}:${ACCOUNTS_PATH})`,
        pathMatch: "full",
    },
    {
        path: ERRORS_PATH,
        outlet: ERRORS_OUTLET,
        component: ErrorListComponent,
    },
    {
        path: ACCOUNTS_PATH,
        outlet: ACCOUNTS_OUTLET,
        component: RouterProxyComponent,
        data: {
            outlet: ACCOUNTS_OUTLET,
        },
        children: [
            {
                path: "",
                loadChildren: "./_accounts/accounts.module#AccountsModule",
                // TODO loadChildren: use async ES import which is only compatible with Ivy Renderer:
                //      https://blog.angularindepth.com/automatically-upgrade-lazy-loaded-angular-modules-for-ivy-e760872e6084
                // loadChildren: async () => {
                //     const {AccountsModule} = await import("src/web/src/app/_accounts/accounts.module");
                //     return AccountsModule;
                // },
            },
        ],
    },
    {
        path: SETTINGS_PATH,
        outlet: SETTINGS_OUTLET,
        component: RouterProxyComponent,
        data: {
            outlet: SETTINGS_OUTLET,
        },
        children: [
            {
                path: "",
                loadChildren: "./_options/options.module#OptionsModule",
                // TODO loadChildren: use async ES import which is only compatible with Ivy Renderer:
                //      https://blog.angularindepth.com/automatically-upgrade-lazy-loaded-angular-modules-for-ivy-e760872e6084
                // loadChildren: async () => {
                //     const {OptionsModule} = await import("src/web/src/app/_options/options.module");
                //     return OptionsModule;
                // },
            },
        ],
    },
];

@NgModule({
    imports: [
        RouterModule.forRoot(routes, {
            useHash: true,
            preloadingStrategy: PreloadAllModules,
            // enableTracing: true,
        }),
    ],
    exports: [
        RouterModule,
    ],
})
export class RoutingModule {}
