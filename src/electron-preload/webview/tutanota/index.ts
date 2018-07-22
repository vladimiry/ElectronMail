import logger from "electron-log";
import {authenticator} from "otplib";
import {distinctUntilChanged, map, switchMap} from "rxjs/operators";
import {EMPTY, from, interval, merge, Observable, Subscriber, throwError} from "rxjs";

import {AccountNotificationType, WebAccountTutanota} from "src/shared/model/account";
import {fetchEntitiesRange} from "src/electron-preload/webview/tutanota/lib/rest";
import {fetchMessages, fetchUserFoldersWithSubFolders} from "src/electron-preload/webview/tutanota/lib/fetcher";
import {getLocationHref, submitTotpToken, typeInputValue, waitElements} from "src/electron-preload/webview/util";
import {MailTypeRef, User} from "src/electron-preload/webview/tutanota/lib/rest/model";
import {NOTIFICATION_LOGGED_IN_POLLING_INTERVAL, NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL} from "src/electron-preload/webview/common";
import {ONE_SECOND_MS} from "src/shared/constants";
import {resolveWebClientApi, WebClientApi} from "src/electron-preload/webview/tutanota/lib/tutanota-api";
import {TUTANOTA_IPC_WEBVIEW_API, TutanotaApi} from "src/shared/api/webview/tutanota";
import {MailFolderTypeService} from "src/shared/util";

const WINDOW = window as any;

delete WINDOW.Notification;

resolveWebClientApi()
    .then((webClientApi) => {
        delete WINDOW.Notification;
        bootstrapApi(webClientApi);
    })
    .catch(logger.error);

function bootstrapApi(webClientApi: WebClientApi) {
    const login2FaWaitElementsConfig = {
        input: () => document.querySelector("#modal input.input") as HTMLInputElement,
        button: () => document.querySelector("#modal input.input ~ div > button") as HTMLElement,
    };

    const endpoints: TutanotaApi = {
        ping: () => EMPTY,

        fetchMessages: (input) => {
            const controller = getUserController();

            if (controller) {
                return fetchMessages({
                    ...input,
                    user: controller.user,
                });
            }

            return EMPTY;
        },

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
            try {
                const observables = [
                    interval(NOTIFICATION_LOGGED_IN_POLLING_INTERVAL).pipe(
                        map(() => isLoggedIn()),
                        distinctUntilChanged(),
                        map((loggedIn) => ({loggedIn})),
                    ),

                    // TODO listen for location.href change instead of starting polling interval
                    interval(NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL).pipe(
                        switchMap(() => from((async () => {
                            const url = getLocationHref();
                            const pageType: (Pick<AccountNotificationType<WebAccountTutanota>, "pageType">)["pageType"] = {
                                url,
                                type: "undefined",
                            };
                            const loginUrlDetected = (url === `${entryUrl}/login` || url.startsWith(`${entryUrl}/login?`));

                            if (loginUrlDetected && !isLoggedIn()) {
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
                    ),

                    // TODO listen for "unread" change instead of starting polling interval
                    Observable.create((observer: Subscriber<{ unread: number }>) => {
                        const intervalHandler = async () => {
                            const controller = getUserController();

                            if (!controller) {
                                return;
                            }

                            const folders = await fetchUserFoldersWithSubFolders(controller.user);
                            const inboxFolder = folders
                                .find(({folderType}) => MailFolderTypeService.testValue(folderType as any, "inbox", false));

                            if (!inboxFolder || !isLoggedIn() || !navigator.onLine) {
                                return;
                            }

                            const {GENERATED_MAX_ID} = webClientApi["src/api/common/EntityFunctions"];
                            const emails = await fetchEntitiesRange(
                                MailTypeRef,
                                inboxFolder.mails,
                                {
                                    count: 50,
                                    reverse: true,
                                    start: GENERATED_MAX_ID,
                                },
                            );
                            const unread = emails.reduce((sum, mail) => sum + Number(mail.unread), 0);

                            observer.next({unread});
                        };

                        setInterval(
                            intervalHandler,
                            ONE_SECOND_MS * 60,
                        );

                        // initial checks after notifications subscription happening
                        setTimeout(intervalHandler, ONE_SECOND_MS * 15);
                    }),
                ];

                return merge(...observables);
            } catch (error) {
                return throwError(error);
            }
        },
    };

    TUTANOTA_IPC_WEBVIEW_API.registerApi(endpoints);
}

function getUserController(): { accessToken: string, user: User } | null {
    return WINDOW.tutao
    && WINDOW.tutao.logins
    && typeof WINDOW.tutao.logins.getUserController === "function"
    && WINDOW.tutao.logins.getUserController() ? WINDOW.tutao.logins.getUserController()
        : null;
}

function isLoggedIn(): boolean {
    const controller = getUserController();
    return !!(controller
        && controller.accessToken
        && controller.accessToken.length
    );
}
