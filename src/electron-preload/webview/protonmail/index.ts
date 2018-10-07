import {Observable, Subscriber, from, interval, merge, of} from "rxjs";
import {authenticator} from "otplib";
import {distinctUntilChanged, map, tap} from "rxjs/operators";

import * as Rest from "./lib/rest";
import {DbPatch} from "src/shared/api/common";
import {
    NOTIFICATION_LOGGED_IN_POLLING_INTERVAL,
    NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL,
    WEBVIEW_LOGGERS,
} from "src/electron-preload/webview/constants";
import {NotificationsProtonmail} from "src/shared/model/account";
import {PROTONMAIL_IPC_WEBVIEW_API, ProtonmailApi} from "src/shared/api/webview/protonmail";
import {Unpacked} from "src/shared/types";
import {buildContact, buildFolder, buildMail} from "./lib/database";
import {curryFunctionMembers} from "src/shared/util";
import {fillInputValue, getLocationHref, submitTotpToken, waitElements} from "src/electron-preload/webview/util";
import {resolveApi} from "./lib/api";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.protonmail, "[index]");
const WINDOW = window as any;
const twoFactorCodeElementId = "twoFactorCode";

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

        throw new Error(`Events processing is not yet implemented`);
    })()),

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

        type LoggedInOutput = Required<Pick<NotificationsProtonmail, "loggedIn">>;
        type PageTypeOutput = Required<Pick<NotificationsProtonmail, "pageType">>;
        type UnreadOutput = Required<Pick<NotificationsProtonmail, "unread">>;

        const observables: [
            Observable<LoggedInOutput>,
            Observable<PageTypeOutput>,
            Observable<UnreadOutput>
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
                        handler: ({MessageCounts}: { MessageCounts?: Array<{ LabelID: string; Unread: number; }> }) => {
                            if (!MessageCounts) {
                                return;
                            }

                            return MessageCounts
                                .filter(({LabelID}) => LabelID === "0")
                                .reduce((accumulator, item) => accumulator + item.Unread, 0);
                        },
                    },
                ];

                return Observable.create((observer: Subscriber<UnreadOutput>) => {
                    XMLHttpRequest.prototype.send = ((original) => {
                        return function(this: XMLHttpRequest) {
                            this.addEventListener("load", function(this: XMLHttpRequest) {
                                responseListeners
                                    .filter(({re}) => re.test(this.responseURL))
                                    .forEach(({handler}) => {
                                        const responseData = JSON.parse(this.responseText);
                                        const value = (handler as any)(responseData);

                                        if (typeof value === "number") {
                                            observer.next({unread: value});
                                        }
                                    });
                            }, false);

                            return original.apply(this, arguments);
                        } as any;
                    })(XMLHttpRequest.prototype.send);
                }).pipe(
                    distinctUntilChanged(({unread: prev}, {unread: curr}) => curr === prev),
                );
            })(),
        ];

        return merge(...observables);
    },
};

PROTONMAIL_IPC_WEBVIEW_API.registerApi(endpoints);
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
        (async (query = {Page: 0, PageSize: 150}) => {
            type Response = Unpacked<ReturnType<typeof api.conversation.query>>;
            const responseItems: Response["data"]["Conversations"] = [];
            let response: Response | undefined;
            while (!response || response.data.Conversations.length) { // fetch all the entities, ie until the end
                response = await api.conversation.query(query);
                responseItems.push(...response.data.Conversations);
                query.Page++;
            }
            const result: Rest.Model.Message[] = [];
            for (const responseItem of responseItems) {
                // TODO consider accumulating fetch requests to array, split array to chunks and fetch them in parallel then
                const {data} = await api.conversation.get(responseItem.ID);
                result.push(...data.Messages);
            }
            return result;
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
        ...patch,
        metadata: {latestEventId},
    };
}
