import combineErrors from "combine-errors";
import {ErrorHandler, Injectable, Injector} from "@angular/core";
import {pick} from "remeda";
import {serializeError} from "serialize-error";
import {Store} from "@ngrx/store";

import {getWebLogger} from "src/web/browser-window/util";
import {NOTIFICATION_ACTIONS} from "./store/actions";

const logger = getWebLogger(__filename);

@Injectable()
export class AppErrorHandler implements ErrorHandler {
    constructor(private readonly injector: Injector) {}

    handleError(
        error: Error & { errors?: unknown },
    ): void {
        (() => {
            const {errors} = error;

            logger.error(
                // WARN: make sure there is no circular recursive data
                serializeError(
                    pick(
                        Array.isArray(errors) && errors.length
                            // rxjs's "UnsubscriptionError" comes with "errors" array prop but "stack" props not well combined
                            ? combineErrors(
                                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment
                                [error, ...errors],
                            )
                            : error,
                        ["name", "message", "stack"],
                    ),
                ),
            );
        })();

        this.injector.get(Store).dispatch(
            NOTIFICATION_ACTIONS.ErrorSkipLogging(error),
        );
    }
}
