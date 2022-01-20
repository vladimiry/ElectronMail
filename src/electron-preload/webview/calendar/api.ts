import {map, tap} from "rxjs/operators";
import {merge, Observable} from "rxjs";

import {curryFunctionMembers} from "src/shared/util";
import {getLocationHref} from "src/electron-preload/webview/lib/util";
import {PROTON_CALENDAR_IPC_WEBVIEW_API, ProtonCalendarApi, ProtonCalendarNotificationOutput} from "src/shared/api/webview/calendar";
import {ProviderApi} from "./provider-api/model";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.calendar, __filename);

export const registerApi = (providerApi: ProviderApi): void => {
    const endpoints: ProtonCalendarApi = {
        async ping() {}, // eslint-disable-line @typescript-eslint/no-empty-function

        notification({accountIndex}) {
            const logger = curryFunctionMembers(_logger, nameof.full(endpoints.notification), accountIndex);

            logger.info();

            type LoggedInOutput = Required<Pick<ProtonCalendarNotificationOutput, "loggedInCalendar">>;
            type CalendarNotificationOutput = Required<Pick<ProtonCalendarNotificationOutput, "calendarNotification">>;

            const observables: [
                Observable<LoggedInOutput>,
                Observable<CalendarNotificationOutput>,
            ] = [
                providerApi._custom_.loggedIn$.pipe(
                    map((loggedIn) => ({loggedInCalendar: loggedIn})),
                ),
                new Observable((subscriber) => {
                    function notification(
                        ...arg: ConstructorParameters<typeof window.Notification>
                    ): void {
                        subscriber.next({calendarNotification: arg});
                    }

                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    notification.prototype = Object.create(window.Notification.prototype);

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                    window.Notification = notification as any;
                }),
            ];

            return merge(...observables).pipe(
                tap((notification) => {
                    logger.verbose(
                        JSON.stringify(
                            "calendarNotification" in notification
                                ? "calendarNotification" // skipping the notification constructor args logging
                                : {notification},
                        )
                    );
                }),
            );
        },
    };

    PROTON_CALENDAR_IPC_WEBVIEW_API.register(endpoints, {logger: _logger});

    _logger.verbose(`api registered, url: ${getLocationHref()}`);
};
