import {APP_BASE_HREF} from "@angular/common";
import {AccordionModule} from "ngx-bootstrap/accordion";
import {BrowserAnimationsModule} from "@angular/platform-browser/animations";
import {BrowserModule} from "@angular/platform-browser";
import {BsDropdownModule} from "ngx-bootstrap/dropdown";
import {CollapseModule} from "ngx-bootstrap/collapse";
import {DragulaModule} from "ng2-dragula";
import {EffectsModule} from "@ngrx/effects";
import {META_REDUCERS, StoreModule} from "@ngrx/store";
import {NgModule} from "@angular/core";
import {PopoverModule} from "ngx-bootstrap/popover";
import {StoreRouterConnectingModule} from "@ngrx/router-store";

import * as AccountsReducer from "./store/reducers/accounts";
import * as DbViewReducer from "./store/reducers/db-view";
import * as ErrorsReducer from "./store/reducers/errors";
import * as OptionsReducer from "./store/reducers/options";
import {AppComponent} from "./components/app.component";
import {AppErrorHandler} from "src/web/src/app/app.error-handler.service";
import {CoreModule} from "./_core/core.module";
import {ErrorItemComponent} from "./components/error-item.component";
import {ErrorListComponent} from "./components/error-list.component";
import {RouterProxyComponent} from "./components/router-proxy.component";
import {RoutingModule} from "./app.routing.module";
import {getMetaReducers, reducers} from "./store/reducers/root";

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
        StoreModule.forRoot(reducers),
        StoreModule.forFeature(AccountsReducer.featureName, AccountsReducer.reducer),
        StoreModule.forFeature(DbViewReducer.featureName, DbViewReducer.reducer),
        StoreModule.forFeature(ErrorsReducer.featureName, ErrorsReducer.reducer),
        StoreModule.forFeature(OptionsReducer.featureName, OptionsReducer.reducer),
        StoreRouterConnectingModule,
        EffectsModule.forRoot([]),
    ],
    declarations: [
        AppComponent,
        ErrorItemComponent,
        ErrorListComponent,
        RouterProxyComponent,
    ],
    providers: [
        {provide: APP_BASE_HREF, useValue: "/"},
        AppErrorHandler,
        {
            provide: META_REDUCERS,
            deps: [AppErrorHandler],
            useFactory: getMetaReducers,
        },
    ],
    bootstrap: [AppComponent],
};
