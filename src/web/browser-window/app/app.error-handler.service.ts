import {ErrorHandler, Injectable, Injector} from "@angular/core";
import {Store} from "@ngrx/store";
import {pick} from "remeda";
import {serializeError} from "serialize-error";

import {NOTIFICATION_ACTIONS} from "./store/actions";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";

const logger = getZoneNameBoundWebLogger("[app.error-handler.service]");

@Injectable()
export class AppErrorHandler implements ErrorHandler {
    constructor(private readonly injector: Injector) {}

    handleError(error: Error): void {
        logger.error(
            // WARN: make sure there is no circular recursive data
            serializeError(
                pick(error, ["name", "message", "stack"]),
            ),
        );

        this.injector.get(Store).dispatch(
            NOTIFICATION_ACTIONS.ErrorSkipLogging(error),
        );
    }
}
