import {Injectable} from "@angular/core";
import {Store} from "@ngrx/store";

import {CoreActions} from "_web_app/store/actions";
import {State} from "_web_app/store/reducers/root";

@Injectable()
export class GlobalErrorHandler implements GlobalErrorHandler {

    constructor(private store: Store<State>) {}

    handleError(error: Error) {
        this.store.dispatch(new CoreActions.Fail(error));
    }
}
