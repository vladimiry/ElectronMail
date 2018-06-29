import {ApplicationRef, NgModule} from "@angular/core";
import {createInputTransfer, createNewHosts, removeNgStyles} from "@angularclass/hmr";
import {Store} from "@ngrx/store";
import {take} from "rxjs/operators";

import {APP_MODULE_NG_CONF} from "_@web/src/app/app.module.constants.ts";
import {ROOT_ACTIONS} from "_@web/src/app/store/actions";
import {State} from "_@web/src/app/store/reducers/root";

@NgModule(APP_MODULE_NG_CONF)
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
