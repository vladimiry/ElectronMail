import {authenticator} from "otplib";
import {distinctUntilChanged, switchMap} from "rxjs/operators";
import {EMPTY, from, interval, merge, Observable, of, Subscriber, throwError} from "rxjs";

import {AccountNotificationType} from "src/shared/model/account";
import {getLocationHref, submitTotpToken, typeInputValue, waitElements} from "src/electron-preload/webview/util";
import {getRange} from "_@webview-preload/tutanota/rest";
import {IPC_WEBVIEW_API, TutanotaApi} from "src/shared/api/webview";
import {MailFolder, MailTypeRef} from "_@webview-preload/tutanota/rest/model";
import {MAX_RESPONSE_ENTITY_ID} from "_@webview-preload/tutanota/from-tutanota-repo";
import {ONE_SECOND_MS} from "src/shared/constants";

const WINDOW = window as any;

document.addEventListener("DOMContentLoaded", () => {
    bootstrap(WINDOW.SystemJS);
});

// tslint:disable-next-line:variable-name
function bootstrap(SystemJS: SystemJSLoader.System) {
    const systemJSbaseURL = String(SystemJS.getConfig().baseURL).replace(/(.*)\/$/, "$1");
    const pageChangePollingIntervalMs = ONE_SECOND_MS * 1.5;
    const unreadInitialCheckTimeoutMs = ONE_SECOND_MS * 10;
    const unreadCheckPollingIntervalMs = ONE_SECOND_MS * 60;
    const login2FaWaitElementsConfig = {
        input: () => document.querySelector("#modal input.input") as HTMLInputElement,
        button: () => document.querySelector("#modal input.input ~ div > button") as HTMLElement,
    };
    const state: { inboxMailFolder?: MailFolder | undefined } = {};

    delete WINDOW.Notification;

    SystemJS
        .import(`${systemJSbaseURL}/src/api/main/WorkerClient.js`)
        .then((workerClient: any) => {
            workerClient.worker._queue._handleMessage = ((orig) => function(this: typeof workerClient) {
                const [response] = arguments;

                if (response && response.type === "response" && Array.isArray(response.value) && response.value.length) {
                    const inboxMailFolder = response.value
                        .filter(({_type, folderType}: any = {}) => {
                            return typeof _type === "object" && _type.type === "MailFolder" && folderType === "1";
                        })
                        .shift();

                    if (inboxMailFolder) {
                        state.inboxMailFolder = inboxMailFolder;
                    }
                }

                return orig.apply(this, arguments);
            })(workerClient.worker._queue._handleMessage);
        })
        .catch((err) => {
            require("electron-log").error(err);
        });

    const endpoints: TutanotaApi = {
        fillLogin: ({login}) => {
            const cancelEvenHandler = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
            };
            const usernameSelector = "form [type=email]";
            const waitElementsConfig = {
                username: () => document.querySelector(usernameSelector) as HTMLInputElement,
                storePasswordCheckbox: () => document.querySelector("form .items-center [type=checkbox]") as HTMLInputElement,
                storePasswordCheckboxBlock: () => document.querySelector("form .checkbox.pt.click") as HTMLInputElement,
            };

            return from((async () => {
                const elements = await waitElements(waitElementsConfig);
                const username = elements.username();
                const storePasswordCheckbox = elements.storePasswordCheckbox();
                const storePasswordCheckboxBlock = elements.storePasswordCheckboxBlock();

                await typeInputValue(username, login);
                username.readOnly = true;

                storePasswordCheckbox.checked = false;
                storePasswordCheckbox.disabled = true;
                storePasswordCheckboxBlock.removeEventListener("click", cancelEvenHandler);
                storePasswordCheckboxBlock.addEventListener("click", cancelEvenHandler, true);

                return EMPTY.toPromise();
            })());
        },

        login: ({password: passwordValue, login}) => {
            const waitElementsConfig = {
                password: () => document.querySelector("form [type=password]") as HTMLInputElement,
                submit: () => document.querySelector("form button") as HTMLElement,
            };

            return from((async () => {
                await endpoints.fillLogin({login}).toPromise();

                const elements = await waitElements(waitElementsConfig);

                if (elements.password().value) {
                    throw new Error("Password is not supposed to be filled already on this stage");
                }

                await typeInputValue(elements.password(), passwordValue);
                elements.submit().click();

                return EMPTY.toPromise();
            })());
        },

        login2fa: ({secret}) => from((async () => {
            const elements = await waitElements(login2FaWaitElementsConfig);
            const spacesLessSecret = secret.replace(/\s/g, "");

            return await submitTotpToken(
                elements.input(),
                elements.button(),
                () => authenticator.generate(spacesLessSecret),
            );
        })()),

        notification: ({entryUrl}) => {
            type PageTypeOutput = Required<Pick<AccountNotificationType, "pageType">>;
            type TitleOutput = Required<Pick<AccountNotificationType, "title">>;
            type UnreadOutput = Required<Pick<AccountNotificationType, "unread">>;

            if (entryUrl !== systemJSbaseURL) {
                return throwError(new Error(
                    `Actually loaded SystemJS Url "${systemJSbaseURL}" and app settings Url "${entryUrl}" don't match`,
                ));
            }

            try {
                const observables = [];

                // pageType
                (() => {
                    // TODO listen for location.href change instead of starting polling interval
                    const observable: Observable<PageTypeOutput> = interval(pageChangePollingIntervalMs).pipe(
                        switchMap(() => from((async () => {
                            const url = getLocationHref();
                            const pageType: PageTypeOutput["pageType"] = {url, type: "undefined"};
                            const loginPageDetected = url === `${entryUrl}/login` || url.startsWith(`${entryUrl}/login?`);

                            if (loginPageDetected) {
                                let twoFactorElements;

                                try {
                                    twoFactorElements = await waitElements(login2FaWaitElementsConfig, {attemptsLimit: 1});
                                } catch (e) {
                                    // NOOP
                                }

                                const twoFactorCodeVisible = twoFactorElements
                                    && twoFactorElements.input().offsetParent
                                    && twoFactorElements.button().offsetParent;

                                if (twoFactorCodeVisible) {
                                    pageType.type = "login2fa";
                                } else {
                                    pageType.type = "login";
                                }
                            }

                            return {pageType};
                        })())),
                        distinctUntilChanged(({pageType: prev}, {pageType: curr}) => prev.type === curr.type),
                    );

                    observables.push(observable);
                })();

                // title
                observables.push(of<TitleOutput>({title: ""}));

                // unread
                (() => {
                    observables.push(
                        // TODO listen for "unread" change instead of starting polling interval
                        Observable.create((observer: Subscriber<UnreadOutput>) => {
                            const intervalHandler = async () => {
                                const userController = WINDOW.tutao
                                    && WINDOW.tutao.logins
                                    && typeof WINDOW.tutao.logins.getUserController === "function"
                                    && WINDOW.tutao.logins.getUserController();
                                const accessToken = userController
                                    && userController.accessToken;

                                if (!state.inboxMailFolder || !accessToken || !navigator.onLine) {
                                    return;
                                }

                                const emails = await getRange(
                                    MailTypeRef,
                                    state.inboxMailFolder.mails,
                                    entryUrl,
                                    {accessToken},
                                    {
                                        count: 50,
                                        start: MAX_RESPONSE_ENTITY_ID,
                                        reverse: true,
                                    },
                                );
                                const unread = emails.reduce((sum, mail) => sum + Number(mail.unread), 0);

                                observer.next({unread});
                            };

                            setInterval(
                                intervalHandler,
                                unreadCheckPollingIntervalMs,
                            );

                            // initial check in "unreadInitialCheckTimeoutMs" after notifications subscription happening
                            setTimeout(intervalHandler, unreadInitialCheckTimeoutMs);
                        }),
                    );
                })();

                return merge(...observables as any);
            } catch (error) {
                return throwError(error);
            }
        },
    };

    IPC_WEBVIEW_API.tutanota.registerApi(endpoints);
}
