import {APP_BASE_HREF} from "@angular/common";
import {AccordionModule} from "ngx-bootstrap/accordion";
import {BrowserAnimationsModule} from "@angular/platform-browser/animations";
import {BrowserModule} from "@angular/platform-browser";
import {BsDropdownModule} from "ngx-bootstrap/dropdown";
import {CollapseModule} from "ngx-bootstrap/collapse";
import {DragulaModule} from "ng2-dragula";
import {EffectsModule} from "@ngrx/effects";
import {ErrorHandler, Injector, NgModule} from "@angular/core";
import {META_REDUCERS, StoreModule} from "@ngrx/store";
import {PopoverModule} from "ngx-bootstrap/popover";
import {StoreRouterConnectingModule} from "@ngrx/router-store";

import * as AccountsReducer from "./store/reducers/accounts";
import * as DbViewReducer from "./store/reducers/db-view";
import * as ErrorsReducer from "./store/reducers/notification";
import * as NotificationReducer from "./store/reducers/notification";
import * as OptionsReducer from "./store/reducers/options";
import {AppComponent} from "./components/app.component";
import {AppErrorHandler} from "src/web/src/app/app.error-handler.service";
import {CoreModule} from "./_core/core.module";
import {RouterProxyComponent} from "./components/router-proxy.component";
import {RoutingModule} from "./app.routing.module";
import {createAppMetaReducer, createErrorHandlingMetaReducer, reducers} from "./store/reducers/root";

export const APP_MODULE_NG_CONF: NgModule = {
    imports: [
        BrowserModule,
        RoutingModule,
        BrowserAnimationsModule,
        CoreModule,
        AccordionModule.forRoot(),
        CollapseModule.forRoot(),
        BsDropdownModule.forRoot(),
        PopoverModule.forRoot(),
        DragulaModule.forRoot(),
        StoreModule.forRoot(
            reducers,
            {
                runtimeChecks: {
                    strictStateImmutability: true,
                    strictActionImmutability: true,
                    // strictStateSerializability: true,
                    // strictActionSerializability: true,
                },
            },
        ),
        StoreModule.forFeature(AccountsReducer.featureName, AccountsReducer.reducer),
        StoreModule.forFeature(DbViewReducer.featureName, DbViewReducer.reducer),
        StoreModule.forFeature(ErrorsReducer.featureName, ErrorsReducer.reducer),
        StoreModule.forFeature(NotificationReducer.featureName, NotificationReducer.reducer),
        StoreModule.forFeature(OptionsReducer.featureName, OptionsReducer.reducer),
        StoreRouterConnectingModule.forRoot(),
        EffectsModule.forRoot([]),
    ],
    declarations: [
        AppComponent,
        RouterProxyComponent,
    ],
    providers: [
        {
            provide: APP_BASE_HREF,
            useValue: "/",
        },
        {
            provide: ErrorHandler,
            useClass: AppErrorHandler,
        },
        {
            provide: META_REDUCERS,
            multi: true,
            deps: [Injector],
            useFactory: createErrorHandlingMetaReducer,
        },
        {
            provide: META_REDUCERS,
            multi: true,
            useFactory: createAppMetaReducer,
        },
    ],
    bootstrap: [AppComponent],
};
