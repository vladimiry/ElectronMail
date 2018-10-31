import * as Throttle from "promise-parallel-throttle";
import {EMPTY, Observable, from, interval, merge, of, throwError} from "rxjs";
import {authenticator} from "otplib";
import {buffer, concatMap, debounceTime, delay, distinctUntilChanged, filter, map, mergeMap, retryWhen, take, tap} from "rxjs/operators";
import {omit} from "ramda";

import * as Database from "./lib/database";
import * as Rest from "./lib/rest";
import {Api, resolveApi} from "./lib/api";
import {DbPatch} from "src/shared/api/common";
import {
    NOTIFICATION_LOGGED_IN_POLLING_INTERVAL,
    NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL,
    WEBVIEW_LOGGERS,
} from "src/electron-preload/webview/constants";
import {ONE_SECOND_MS} from "src/shared/constants";
import {PROTONMAIL_IPC_WEBVIEW_API, ProtonmailApi, ProtonmailNotificationOutput} from "src/shared/api/webview/protonmail";
import {Unpacked} from "src/shared/types";
import {buildContact, buildFolder, buildMail} from "./lib/database";
import {buildLoggerBundle} from "src/electron-preload/util";
import {curryFunctionMembers, isEntityUpdatesPatchNotEmpty} from "src/shared/util";
import {fillInputValue, getLocationHref, submitTotpToken, waitElements} from "src/electron-preload/webview/util";
import {isAngularJsHttpResponse, isUpsertOperationType} from "./lib/uilt";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.protonmail, "[index]");
const WINDOW = window as any; // TODO remove "as any" casting on https://github.com/Microsoft/TypeScript/issues/14701 resolving
const twoFactorCodeElementId = "twoFactorCode";
const ajaxSendNotificationSkipParam = `ajax-send-notification-skip-${Number(new Date())}`;
const ajaxSendNotification$ = new Observable<XMLHttpRequest>((subscriber) => {
    const successHttpStatus = (status: number) => status >= 200 && status < 300;
    const ajaxSendNotificationSkipSymbol = Symbol(ajaxSendNotificationSkipParam);
    type XMLHttpRequestType = XMLHttpRequest & { [ajaxSendNotificationSkipSymbol]?: true };

    XMLHttpRequest.prototype.open = ((
        original = XMLHttpRequest.prototype.open,
        urlArgIndex = 1,
        removeAjaxNotificationSkipParamRe = new RegExp(`[\\?\\&]${ajaxSendNotificationSkipParam}=`),
    ) => function(this: XMLHttpRequestType) {
        const args = [...arguments];
        if (args.length && String(args[urlArgIndex]).indexOf(ajaxSendNotificationSkipParam) !== -1) {
            this[ajaxSendNotificationSkipSymbol] = true;
            args[urlArgIndex] = args[urlArgIndex].replace(removeAjaxNotificationSkipParamRe, "");
        }
        return original.apply(this, args);
    })();

    XMLHttpRequest.prototype.send = ((
        original = XMLHttpRequest.prototype.send,
        loadHandler = function(this: XMLHttpRequestType) {
            if (this[ajaxSendNotificationSkipSymbol]) {
                return;
            }
            if (successHttpStatus(this.status)) {
                subscriber.next(this);
                return;
            }
            _logger.error(
                "[XMLHttpRequest.load handler]",
                JSON.stringify({status: this.status, statusText: this.statusText, responseURL: this.responseURL}),
            );
        },
        loadEndHandler = function(this: XMLHttpRequestType) {
            delete this[ajaxSendNotificationSkipSymbol];
            this.removeEventListener("load", loadHandler);
            this.removeEventListener("loadend", loadHandler);
        },
    ) => function(this: XMLHttpRequestType) {
        this.addEventListener("load", loadHandler);
        this.addEventListener("loadend", loadEndHandler);
        return original.apply(this, arguments);
    })();
});

delete WINDOW.Notification;

const endpoints: ProtonmailApi = {
    ping: () => of(null),

    buildDbPatch: (input) => from((async (logger = curryFunctionMembers(_logger, "api:buildDbPatch()", input.zoneName)) => {
        logger.info();

        if (!isLoggedIn()) {
            throw new Error("protonmail:buildDbPatch(): user is supposed to be logged-in");
        }

        if (!input.metadata || !input.metadata.latestEventId) {
            return await bootstrapDbPatch();
        }

        const {missedEvents, latestEventId, hasMoreEvents} = await (async (
            {events, $http}: Api,
            id: Rest.Model.Event["EventID"],
        ) => {
            const bufferSize = 50;
            const fetchedEvents: Rest.Model.Event[] = [];
            const state: { iteration: number; hasMoreEvents?: boolean; } = {iteration: 0};

            do {
                state.iteration++;

                const response = await events.get(id, {params: {[ajaxSendNotificationSkipParam]: ""}});
                const sameNextId = id === response.EventID;

                fetchedEvents.push(response);
                id = response.EventID;

                if (response.More !== 1) {
                    break;
                }
                if (sameNextId) {
                    throw new Error(
                        `Events API indicates that there is next event in the queue, but responses with the same "next event id"`,
                    );
                }
                if (state.iteration < bufferSize) {
                    continue;
                }

                state.hasMoreEvents = true;
                logger.verbose(`breaking after ${state.iteration} iterations`);
            } while (true);

            logger.info(`fetched ${fetchedEvents.length} missed events`);

            return {
                latestEventId: id,
                missedEvents: fetchedEvents,
                hasMoreEvents: state.hasMoreEvents,
            };
        })(await resolveApi(), input.metadata.latestEventId);

        const patch = await buildDbPatch({events: missedEvents, _logger: logger});
        const metadata: Unpacked<ReturnType<ProtonmailApi["buildDbPatch"]>>["metadata"] = {latestEventId};

        return {
            patch,
            metadata,
            hasMoreEvents,
        };
    })()).pipe(
        retryWhen((errors) => errors.pipe(
            mergeMap((error) => {
                if (isAngularJsHttpResponse(error) && error.status === -1) {
                    _logger.verbose(`retry "buildDbPatch" on network -1 error`);
                    return of(error);
                }
                return throwError(error);
            }),
            delay(ONE_SECOND_MS * 3),
            take(3),
        )),
    ),

    fillLogin: ({login, zoneName}) => from((async (logger = curryFunctionMembers(_logger, "api:fillLogin()", zoneName)) => {
        logger.info();

        const elements = await waitElements({
            username: () => document.getElementById("username") as HTMLInputElement,
        });
        logger.verbose(`elements resolved`);

        await fillInputValue(elements.username, login);
        logger.verbose(`input values filled`);

        elements.username.readOnly = true;

        return null;
    })()),

    login: ({login, password, zoneName}) => from((async (logger = curryFunctionMembers(_logger, "api:login()", zoneName)) => {
        logger.info();

        await endpoints.fillLogin({login, zoneName}).toPromise();
        logger.verbose(`fillLogin() executed`);

        const elements = await waitElements({
            password: () => document.getElementById("password") as HTMLInputElement,
            submit: () => document.getElementById("login_btn") as HTMLElement,
        });
        logger.verbose(`elements resolved`);

        if (elements.password.value) {
            throw new Error(`Password is not supposed to be filled already on "login" stage`);
        }

        await fillInputValue(elements.password, password);
        logger.verbose(`input values filled`);

        elements.submit.click();
        logger.verbose(`clicked`);

        return null;
    })()),

    login2fa: ({secret, zoneName}) => from((async (logger = curryFunctionMembers(_logger, "api:login2fa()", zoneName)) => {
        logger.info();

        const elements = await waitElements({
            input: () => document.getElementById(twoFactorCodeElementId) as HTMLInputElement,
            button: () => document.getElementById("login_btn_2fa") as HTMLElement,
        });
        logger.verbose(`elements resolved`);

        return await submitTotpToken(
            elements.input,
            elements.button,
            () => authenticator.generate(secret),
            logger,
        );
    })()),

    unlock: ({mailPassword, zoneName}) => from((async (logger = curryFunctionMembers(_logger, "api:unlock()", zoneName)) => {
        logger.info();

        const elements = await waitElements({
            mailboxPassword: () => document.getElementById("password") as HTMLInputElement,
            submit: () => document.getElementById("unlock_btn") as HTMLElement,
        });

        await fillInputValue(elements.mailboxPassword, mailPassword);
        elements.submit.click();

        return null;
    })()),

    notification: ({entryUrl, zoneName}) => {
        const logger = curryFunctionMembers(_logger, "api:notification()", zoneName);
        logger.info();

        type LoggedInOutput = Required<Pick<ProtonmailNotificationOutput, "loggedIn">>;
        type PageTypeOutput = Required<Pick<ProtonmailNotificationOutput, "pageType">>;
        type UnreadOutput = Required<Pick<ProtonmailNotificationOutput, "unread">>;
        type BatchEntityUpdatesCounterOutput = Required<Pick<ProtonmailNotificationOutput, "batchEntityUpdatesCounter">>;

        const observables: [
            Observable<LoggedInOutput>,
            Observable<PageTypeOutput>,
            Observable<UnreadOutput>,
            Observable<BatchEntityUpdatesCounterOutput>
            ] = [
            interval(NOTIFICATION_LOGGED_IN_POLLING_INTERVAL).pipe(
                map(() => isLoggedIn()),
                distinctUntilChanged(),
                map((loggedIn) => ({loggedIn})),
            ),

            // TODO listen for location.href change instead of starting polling interval
            interval(NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL).pipe(
                map(() => {
                    const url = getLocationHref();
                    const pageType: PageTypeOutput["pageType"] = {url, type: "unknown"};

                    if (!isLoggedIn()) {
                        switch (url) {
                            case `${entryUrl}/login`: {
                                const twoFactorCode = document.getElementById(twoFactorCodeElementId);
                                const twoFactorCodeVisible = twoFactorCode && twoFactorCode.offsetParent;

                                if (twoFactorCodeVisible) {
                                    pageType.type = "login2fa";
                                } else {
                                    pageType.type = "login";
                                }

                                break;
                            }
                            case `${entryUrl}/login/unlock`: {
                                pageType.type = "unlock";
                                break;
                            }
                        }
                    }

                    return {pageType};
                }),
                distinctUntilChanged(({pageType: prev}, {pageType: curr}) => curr.type === prev.type),
                tap((value) => logger.verbose(JSON.stringify(value))),
            ),

            (() => {
                const responseListeners = [
                    {
                        re: new RegExp(`${entryUrl}/api/messages/count`),
                        handler: ({Counts}: { Counts?: Array<{ LabelID: string; Unread: number; }> }) => {
                            if (!Counts) {
                                return;
                            }
                            return Counts
                                .filter(({LabelID}) => LabelID === "0")
                                .reduce((accumulator, item) => accumulator + item.Unread, 0);
                        },
                    },
                    {
                        re: new RegExp(`${entryUrl}/api/events/.*==`),
                        handler: ({MessageCounts}: Rest.Model.EventResponse) => {
                            if (!MessageCounts) {
                                return;
                            }
                            return MessageCounts
                                .filter(({LabelID}) => LabelID === "0")
                                .reduce((accumulator, item) => accumulator + item.Unread, 0);
                        },
                    },
                ];

                return ajaxSendNotification$.pipe(
                    mergeMap((request) => responseListeners
                        .filter(({re}) => {
                            return re.test(request.responseURL);
                        })
                        .reduce(
                            (accumulator, {handler}) => {
                                const responseData = JSON.parse(request.responseText);
                                const value = (handler as any)(responseData);

                                return typeof value === "number"
                                    ? accumulator.concat([{unread: value}])
                                    : accumulator;
                            },
                            [] as UnreadOutput[],
                        )),
                    distinctUntilChanged((prev, curr) => curr.unread === prev.unread),
                );
            })(),

            (() => {
                const innerLogger = curryFunctionMembers(logger, `[entity update notification]`);
                const eventsUrlRe = new RegExp(`${entryUrl}/api/events/.*==`);
                const notification = {batchEntityUpdatesCounter: 0};
                const notificationReceived$: Observable<Rest.Model.EventResponse> = ajaxSendNotification$.pipe(
                    filter((request) => eventsUrlRe.test(request.responseURL)),
                    map((request) => JSON.parse(request.responseText)),
                );

                return notificationReceived$.pipe(
                    buffer(notificationReceived$.pipe(
                        debounceTime(ONE_SECOND_MS * 1.5),
                    )),
                    concatMap((events) => from(buildDbPatch({events}, true))),
                    concatMap((patch) => {
                        if (!isEntityUpdatesPatchNotEmpty(patch)) {
                            return EMPTY;
                        }
                        for (const key of (Object.keys(patch) as Array<keyof typeof patch>)) {
                            innerLogger.info(`upsert/remove ${key}: ${patch[key].upsert.length}/${patch[key].remove.length}`);
                        }
                        notification.batchEntityUpdatesCounter++;
                        return [notification];
                    }),
                );
            })(),
        ];

        return merge(...observables);
    },
};

PROTONMAIL_IPC_WEBVIEW_API.registerApi(
    endpoints,
    {
        logger: {
            error: (args: any[]) => {
                _logger.error(...args.map((arg) => {
                    if (isAngularJsHttpResponse(arg)) {
                        return {
                            // omitting possibly sensitive properties
                            ...omit(["config", "headers", "data"], arg),
                            url: arg.config && arg.config.url,
                        };
                    }
                    return arg;
                }));
            },
            info: () => {},
        },
    },
);
_logger.verbose(`api registered, url: ${getLocationHref()}`);

function isLoggedIn(): boolean {
    const angular: angular.IAngularStatic | undefined = WINDOW.angular;
    const htmlElement = angular && typeof angular.element === "function" && angular.element("html");
    const $injector = htmlElement && typeof htmlElement.data === "function" && htmlElement.data("$injector");
    const authentication = $injector && $injector.get("authentication");

    return authentication && authentication.isLoggedIn();
}

async function bootstrapDbPatch(): Promise<Unpacked<ReturnType<ProtonmailApi["buildDbPatch"]>>> {
    const api = await resolveApi();
    // WARN "getLatestID" should be called before any other fetching
    // so app gets any potentially missed changes happening during the function execution
    const latestEventId = await api.events.getLatestID();
    if (!latestEventId) {
        throw new Error(`"getLatestID" call returned empty value`);
    }
    const [messages, contacts, labels] = await Promise.all([
        // messages
        (async (query = {Page: 0, PageSize: 150}, throttleOptions = {maxInProgress: 3, failFast: true}) => {
            type Response = Unpacked<ReturnType<typeof api.conversation.query>>;
            const responseItems: Response["data"]["Conversations"] = [];
            let response: Response | undefined;
            while (!response || response.data.Conversations.length) { // fetch all the entities, ie until the end
                response = await api.conversation.query(query);
                responseItems.push(...response.data.Conversations);
                query.Page++;
            }
            const conversationMessages = await Throttle.all(
                responseItems.map(({ID}) => async () => (await api.conversation.get(ID)).data.Messages),
                throttleOptions,
            );
            return await Throttle.all(
                conversationMessages
                    .reduce((accumulator, array) => accumulator.concat(array), [])
                    .map((mail) => async () => {
                        if (mail.Body) {
                            return mail;
                        }
                        return (await api.message.get(mail.ID)).data.Message;
                    }),
                throttleOptions,
            );
        })(),
        // contacts
        (async () => {
            const responseItems = await api.contact.all();
            const result: Rest.Model.Contact[] = [];
            for (const responseItem of responseItems) {
                // TODO consider accumulating fetch requests to array, split array to chunks and fetch them in parallel then
                const item = await api.contact.get(responseItem.ID);
                result.push(item);
            }
            return result;
        })(),
        // labels
        (async () => {
            const response = await api.label.query({Type: Rest.Model.LABEL_TYPE.MESSAGE}); // fetch all the entities
            return response.data.Labels;
        })(),
    ]);

    const patch: DbPatch = {
        conversationEntries: {remove: [], upsert: []},
        mails: {remove: [], upsert: await Promise.all(messages.map((message) => buildMail(message, api)))},
        folders: {remove: [], upsert: labels.map(buildFolder)},
        contacts: {remove: [], upsert: contacts.map(buildContact)},
    };

    return {
        patch,
        metadata: {latestEventId},
    };
}

async function buildDbPatch(
    input: {
        events: Rest.Model.Event[];
        _logger?: ReturnType<typeof buildLoggerBundle>;
    },
    nullUpsert: boolean = false,
): Promise<DbPatch> {
    const api = await resolveApi();
    const logger = input._logger
        ? curryFunctionMembers(input._logger, "buildDbPatch()")
        : {info: (...args: any[]) => {}, verbose: (...args: any[]) => {}};
    const mappingItem = () => ({updatesMappedByInstanceId: new Map(), remove: [], upsertIds: []});
    const mapping: Record<"mails" | "folders" | "contacts", {
        remove: Array<{ pk: string }>;
        upsertIds: Rest.Model.Id[];
    }> & {
        mails: {
            refType: keyof Pick<Rest.Model.Event, "Messages">;
            updatesMappedByInstanceId: Map<Rest.Model.Id, Array<Unpacked<Required<Rest.Model.Event>["Messages"]>>>;
        },
        folders: {
            refType: keyof Pick<Rest.Model.Event, "Labels">;
            updatesMappedByInstanceId: Map<Rest.Model.Id, Array<Unpacked<Required<Rest.Model.Event>["Labels"]>>>;
        },
        contacts: {
            refType: keyof Pick<Rest.Model.Event, "Contacts">;
            updatesMappedByInstanceId: Map<Rest.Model.Id, Array<Unpacked<Required<Rest.Model.Event>["Contacts"]>>>;
        },
    } = {
        mails: {refType: "Messages", ...mappingItem()},
        folders: {refType: "Labels", ...mappingItem()},
        contacts: {refType: "Contacts", ...mappingItem()},
    };
    const mappingKeys = Object.keys(mapping) as Array<keyof typeof mapping>;

    for (const event of input.events) {
        for (const key of mappingKeys) {
            const {refType, updatesMappedByInstanceId: updatesMappedByInstanceId} = mapping[key];
            const updateItems = event[refType];
            if (!updateItems) {
                continue;
            }
            for (const updateItem of updateItems) {
                updatesMappedByInstanceId.set(updateItem.ID, (updatesMappedByInstanceId.get(updateItem.ID) || []).concat(updateItem));
            }
        }
    }

    logger.verbose([
        `resolved unique entities to process history chain:`,
        mappingKeys.map((key) => `${key}: ${mapping[key].updatesMappedByInstanceId.size}`).join("; "),
    ].join(" "));

    for (const key of mappingKeys) {
        const {updatesMappedByInstanceId, upsertIds, remove} = mapping[key];
        for (const entityUpdates of updatesMappedByInstanceId.values()) {
            let upserted = false;
            // entity updates sorted in ASC order, so reversing the entity updates list in order to start processing from the newest items
            for (const update of entityUpdates.reverse()) {
                if (!upserted && isUpsertOperationType(update.Action)) {
                    upsertIds.push(update.ID);
                    upserted = true;
                }
                if (update.Action === Rest.Model.EVENT_ACTION.DELETE) {
                    remove.push({pk: Database.buildPk(update.ID)});
                    break;
                }
            }
        }
    }

    const patch: DbPatch = {
        conversationEntries: {remove: [], upsert: []},
        mails: {remove: mapping.mails.remove, upsert: []},
        folders: {remove: mapping.folders.remove, upsert: []},
        contacts: {remove: mapping.contacts.remove, upsert: []},
    };

    if (!nullUpsert) {
        for (const id of mapping.mails.upsertIds) {
            const response = await api.message.get(id);
            patch.mails.upsert.push(await Database.buildMail(response.data.Message, api));
        }
        await (async () => {
            const response = await api.label.query();
            const folders = response.data.Labels
                .filter(({ID}) => mapping.folders.upsertIds.includes(ID))
                .map(Database.buildFolder);
            patch.folders.upsert.push(...folders);
        })();
        for (const id of mapping.contacts.upsertIds) {
            const contact = await api.contact.get(id);
            patch.contacts.upsert.push(Database.buildContact(contact));
        }
    } else {
        // we only need the data structure to be formed at this point, so no need to perform the actual fetching
        for (const key of mappingKeys) {
            mapping[key].upsertIds.forEach(() => {
                (patch[key].upsert as any[]).push(null);
            });
        }
    }

    logger.verbose([
        `upsert/remove:`,
        mappingKeys.map((key) => `${key}: ${patch[key].upsert.length}/${patch[key].remove.length}`).join("; "),
    ].join(" "));

    return patch;
}
