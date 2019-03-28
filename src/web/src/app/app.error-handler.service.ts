import {ErrorHandler, Injectable, Injector} from "@angular/core";
import {Store} from "@ngrx/store";

import {CORE_ACTIONS} from "src/web/src/app/store/actions";

@Injectable()
export class AppErrorHandler implements ErrorHandler {
    constructor(private injector: Injector) {}

    handleError(error: Error) {
        this.injector.get(Store).dispatch(CORE_ACTIONS.Fail(error));
    }
}
