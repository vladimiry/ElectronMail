import {take} from "rxjs/operators";
import {StoreRouterConnectingModule} from "@ngrx/router-store";
import {ApplicationRef, NgModule} from "@angular/core";
import {BrowserModule} from "@angular/platform-browser";
import {EffectsModule} from "@ngrx/effects";
import {Store, StoreModule} from "@ngrx/store";
import {APP_BASE_HREF} from "@angular/common";
import {createInputTransfer, createNewHosts, removeNgStyles} from "@angularclass/hmr";
import {BsDropdownModule} from "ngx-bootstrap/dropdown";
import {PopoverModule} from "ngx-bootstrap/popover";

import {CoreModule} from "./+core/core.module";
import {RoutingModule} from "./app.routing.module";
import {AppComponent} from "./components/app.component";
import {metaReducers, reducers, State} from "./store/reducers/root";
import * as AccountsReducer from "./store/reducers/accounts";
import * as ErrorsReducer from "./store/reducers/errors";
import * as OptionsReducer from "./store/reducers/options";
import {RouterProxyComponent} from "./components/router-proxy.component";
import {ErrorListComponent} from "./components/error-list.component";
import {ErrorItemComponent} from "./components/error-item.component";
import {ROOT_ACTIONS} from "_@web/src/app/store/actions";

// TODO do not load HMR stuff for production build
@NgModule({
    imports: [
        BrowserModule,
        RoutingModule,
        CoreModule,
        BsDropdownModule.forRoot(),
        PopoverModule.forRoot(),
        StoreModule.forRoot(reducers, {metaReducers}),
        StoreModule.forFeature(AccountsReducer.featureName, AccountsReducer.reducer),
        StoreModule.forFeature(ErrorsReducer.featureName, ErrorsReducer.reducer),
        StoreModule.forFeature(OptionsReducer.featureName, OptionsReducer.reducer),
        StoreModule.forFeature(OptionsReducer.featureName, OptionsReducer.reducer),
        StoreRouterConnectingModule,
        EffectsModule.forRoot([]),
    ],
    declarations: [
        AppComponent,
        RouterProxyComponent,
        ErrorListComponent,
        ErrorItemComponent,
    ],
    providers: [
        {provide: APP_BASE_HREF, useValue: "/"},
    ],
    bootstrap: [AppComponent],
})
export class AppModule {
    constructor(private appRef: ApplicationRef,
                private store: Store<any>) {}

    hmrOnInit(store: HrmStore) {
        if (!store || !store.state) {
            return;
        }

        if (store.state) {
            this.store.dispatch(ROOT_ACTIONS.HmrStateRestoreAction(store.state));
        }

        if ("restoreInputValues" in store) {
            store.restoreInputValues();
        }

        this.appRef.tick();
        delete store.state;
        delete store.restoreInputValues;
    }

    hmrOnDestroy(store: HrmStore) {
        const cmpLocation = this.appRef.components.map((cmp) => cmp.location.nativeElement);

        this.store
            .pipe(take(1))
            .subscribe((appState) => store.state = appState);

        store.disposeOldHosts = createNewHosts(cmpLocation);
        store.restoreInputValues = createInputTransfer();

        removeNgStyles();
    }

    hmrAfterDestroy(store: HrmStore) {
        store.disposeOldHosts();
        delete store.disposeOldHosts;
    }
}

export interface HrmStore {
    state: State;
    restoreInputValues: () => void;
    disposeOldHosts: () => void;
}
