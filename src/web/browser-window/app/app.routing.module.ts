import {NgModule} from "@angular/core";
import {PreloadAllModules, RouterModule, Routes} from "@angular/router";

import {
    ACCOUNTS_OUTLET,
    ACCOUNTS_PATH,
    NOTIFICATIONS_OUTLET,
    NOTIFICATIONS_PATH,
    SETTINGS_OUTLET,
    SETTINGS_PATH,
} from "./app.constants";
import {RouterProxyComponent} from "./components/router-proxy.component";

// TODO consider getting rid of the lazy loading, it's not really needed for the Electron application
const routes: Routes = [
    {
        path: "",
        redirectTo: `/(${ACCOUNTS_OUTLET}:${ACCOUNTS_PATH})`,
        pathMatch: "full",
    },
    {
        path: ACCOUNTS_PATH,
        outlet: ACCOUNTS_OUTLET,
        component: RouterProxyComponent,
        data: {
            // "ROUTER_DATA_OUTLET_PROP" can't be a constant, see https://github.com/angular/angular-cli/issues/4686#issuecomment-400572965
            ROUTER_DATA_OUTLET_PROP: ACCOUNTS_OUTLET,
        },
        children: [
            {
                path: "",
                loadChildren: "./_accounts/accounts.module#AccountsModule",
                // TODO use async ES import which is only compatible with Ivy Renderer
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
            ROUTER_DATA_OUTLET_PROP: SETTINGS_OUTLET,
        },
        children: [
            {
                path: "",
                loadChildren: "./_options/options.module#OptionsModule",
                // TODO use async ES import which is only compatible with Ivy Renderer
                // loadChildren: async () => {
                //     const {OptionsModule} = await import("src/web/src/app/_options/options.module");
                //     return OptionsModule;
                // },
            },
        ],
    },
    {
        path: NOTIFICATIONS_PATH,
        outlet: NOTIFICATIONS_OUTLET,
        component: RouterProxyComponent,
        data: {
            ROUTER_DATA_OUTLET_PROP: NOTIFICATIONS_OUTLET,
        },
        children: [
            {
                path: "",
                loadChildren: "./_notification/notification.module#NotificationModule",
                // TODO use async ES import which is only compatible with Ivy Renderer
                // loadChildren: async () => {
                //     const {NotificationModule} = await import("src/web/src/app/_notification/notification.module");
                //     return NotificationModule;
                // },
            },
        ],
    },
];

@NgModule({
    imports: [
        RouterModule.forRoot(
            routes,
            {
                useHash: true,
                preloadingStrategy: PreloadAllModules,
                // enableTracing: true,
                // relativeLinkResolution: "corrected", // TODO set {relativeLinkResolution: "corrected"}
            },
        ),
    ],
    exports: [
        RouterModule,
    ],
})
export class RoutingModule {}
