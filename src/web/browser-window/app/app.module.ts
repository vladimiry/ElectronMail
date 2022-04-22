import {AccordionModule} from "ngx-bootstrap/accordion";
import {APP_BASE_HREF} from "@angular/common";
import {BrowserAnimationsModule} from "@angular/platform-browser/animations";
import {BrowserModule} from "@angular/platform-browser";
import {BsDatepickerModule} from "ngx-bootstrap/datepicker";
import {BsDropdownModule} from "ngx-bootstrap/dropdown";
import {ButtonsModule} from "ngx-bootstrap/buttons";
import {CollapseModule} from "ngx-bootstrap/collapse";
import {EffectsModule} from "@ngrx/effects";
import {ErrorHandler, Injector, NgModule} from "@angular/core";
import {META_REDUCERS, RuntimeChecks, StoreModule} from "@ngrx/store";
import {ModalModule} from "ngx-bootstrap/modal";
import {PopoverModule} from "ngx-bootstrap/popover";

import * as AccountsReducer from "./store/reducers/accounts";
import {AppComponent} from "./components/app.component";
import {AppErrorHandler} from "./app.error-handler.service";
import {CoreModule} from "./_core/core.module";
import * as DbViewReducer from "./store/reducers/db-view";
import * as NotificationReducer from "./store/reducers/notification";
import * as OptionsReducer from "./store/reducers/options";
import {PACKAGE_GITHUB_PROJECT_URL} from "src/shared/const";
import {PACKAGE_GITHUB_PROJECT_URL_TOKEN} from "./app.constants";
import * as RootReducer from "./store/reducers/root";
import {RouterProxyComponent} from "./components/router-proxy.component";
import {RoutingModule} from "./app.routing.module";

const runtimeChecks: Readonly<Required<RuntimeChecks>> = {
    strictActionImmutability: BUILD_ENVIRONMENT === "development",
    strictStateSerializability: BUILD_ENVIRONMENT === "development",
    strictActionSerializability: BUILD_ENVIRONMENT === "development",
    strictActionTypeUniqueness: BUILD_ENVIRONMENT === "development",
    strictActionWithinNgZone: BUILD_ENVIRONMENT === "development",
    strictStateImmutability: BUILD_ENVIRONMENT === "development",
};

@NgModule({
    declarations: [
        AppComponent,
        RouterProxyComponent,
    ],
    imports: [
        AccordionModule.forRoot(),
        BrowserAnimationsModule,
        BrowserModule,
        BsDatepickerModule.forRoot(),
        BsDropdownModule.forRoot(),
        ButtonsModule.forRoot(),
        CollapseModule.forRoot(),
        CoreModule,
        ModalModule.forRoot(),
        PopoverModule.forRoot(),
        RoutingModule,
        StoreModule.forRoot(RootReducer.reducers, {runtimeChecks}),
        StoreModule.forFeature(AccountsReducer.featureName, AccountsReducer.reducer),
        StoreModule.forFeature(DbViewReducer.featureName, DbViewReducer.reducer),
        StoreModule.forFeature(NotificationReducer.featureName, NotificationReducer.reducer),
        StoreModule.forFeature(OptionsReducer.featureName, OptionsReducer.reducer),
        EffectsModule.forRoot([]),
    ],
    providers: [
        {
            provide: PACKAGE_GITHUB_PROJECT_URL_TOKEN,
            useValue: PACKAGE_GITHUB_PROJECT_URL,
        },
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
            useFactory: RootReducer.createErrorHandlingMetaReducer,
        },
        {
            provide: META_REDUCERS,
            multi: true,
            useFactory: RootReducer.createAppMetaReducer,
        },
    ],
    bootstrap: [AppComponent],
})
export class AppModule {}
