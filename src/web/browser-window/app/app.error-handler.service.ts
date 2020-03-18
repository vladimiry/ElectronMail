import {ErrorHandler, Injectable, Injector} from "@angular/core";
import {Store} from "@ngrx/store";

import {NOTIFICATION_ACTIONS} from "./store/actions";

@Injectable()
export class AppErrorHandler implements ErrorHandler {
    constructor(private injector: Injector) {}

    handleError(error: Error): void {
        this.injector.get(Store).dispatch(NOTIFICATION_ACTIONS.Error(error));
    }
}
