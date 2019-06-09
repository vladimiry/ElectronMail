import {ErrorHandler, Injectable, Injector} from "@angular/core";
import {Store} from "@ngrx/store";

import {NOTIFICATION_ACTIONS} from "src/web/src/app/store/actions";

@Injectable()
export class AppErrorHandler implements ErrorHandler {
    constructor(private injector: Injector) {}

    handleError(error: Error) {
        this.injector.get(Store).dispatch(NOTIFICATION_ACTIONS.Error(error));
    }
}
