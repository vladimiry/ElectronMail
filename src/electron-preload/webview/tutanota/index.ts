import {authenticator} from "otplib";
import {concatMap, distinctUntilChanged, map, shareReplay, tap} from "rxjs/operators";
import {EMPTY, from, interval, merge, Observable, Subscriber} from "rxjs";

import {
    NOTIFICATION_LOGGED_IN_POLLING_INTERVAL,
    NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL,
    WEBVIEW_LOGGERS,
} from "src/electron-preload/webview/constants";
import {AccountNotificationType, WebAccountTutanota} from "src/shared/model/account";
import {curryFunctionMembers, MailFolderTypeService} from "src/shared/util";
import {fetchEntitiesRange} from "src/electron-preload/webview/tutanota/lib/rest";
import {fetchMessages, fetchUserFoldersWithSubFolders} from "src/electron-preload/webview/tutanota/lib/fetcher";
import {fillInputValue, getLocationHref, submitTotpToken, waitElements} from "src/electron-preload/webview/util";
import {MailTypeRef, User} from "src/electron-preload/webview/tutanota/lib/rest/model";
import {ONE_SECOND_MS} from "src/shared/constants";
import {resolveWebClientApi, WebClientApi} from "src/electron-preload/webview/tutanota/lib/tutanota-api";
import {TUTANOTA_IPC_WEBVIEW_API, TutanotaApi} from "src/shared/api/webview/tutanota";

const WINDOW = window as any;
const logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, "[index]");

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

        fetchMessages: ({login, newestStoredTimestamp, type}) => {
            const controller = getUserController();

            if (controller) {
                return fetchMessages({login, newestStoredTimestamp, type, user: controller.user});
            }

            return EMPTY;
        },

        fillLogin: ({login, zoneName}) => from((async () => {
            const _logPrefix = ["fillLogin()", zoneName];
            logger.info(..._logPrefix);

            const cancelEvenHandler = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
            };
            const elements = await waitElements({
                username: () => document.querySelector("form [type=email]") as HTMLInputElement,
                storePasswordCheckbox: () => document.querySelector("form .items-center [type=checkbox]") as HTMLInputElement,
                storePasswordCheckboxBlock: () => document.querySelector("form .checkbox.pt.click") as HTMLInputElement,
            });
            logger.verbose(..._logPrefix, `elements resolved`);

            await fillInputValue(elements.username, login);
            elements.username.readOnly = true;
            logger.verbose(..._logPrefix, `input values filled`);

            elements.storePasswordCheckbox.checked = false;
            elements.storePasswordCheckbox.disabled = true;
            elements.storePasswordCheckboxBlock.removeEventListener("click", cancelEvenHandler);
            elements.storePasswordCheckboxBlock.addEventListener("click", cancelEvenHandler, true);
            logger.verbose(..._logPrefix, `"store" checkbox disabled`);

            return EMPTY.toPromise();
        })()),

        login: ({password: passwordValue, login, zoneName}) => from((async () => {
            const _logPrefix = ["login()", zoneName];
            logger.info(..._logPrefix);

            await endpoints.fillLogin({login, zoneName}).toPromise();
            logger.verbose(..._logPrefix, `fillLogin() executed`);

            const elements = await waitElements({
                password: () => document.querySelector("form [type=password]") as HTMLInputElement,
                submit: () => document.querySelector("form button") as HTMLElement,
            });
            logger.verbose(..._logPrefix, `elements resolved`);

            if (elements.password.value) {
                throw new Error(`Password is not supposed to be filled already on "login" stage`);
            }

            await fillInputValue(elements.password, passwordValue);
            logger.verbose(..._logPrefix, `input values filled`);

            elements.submit.click();
            logger.verbose(..._logPrefix, `clicked`);

            return EMPTY.toPromise();
        })()),

        login2fa: ({secret, zoneName}) => from((async () => {
            const _logPrefix = ["login2fa()", zoneName];
            logger.info(..._logPrefix);

            const elements = await waitElements(login2FaWaitElementsConfig);
            logger.verbose(..._logPrefix, `elements resolved`);

            const spacesLessSecret = secret.replace(/\s/g, "");

            return await submitTotpToken(
                elements.input,
                elements.button,
                () => authenticator.generate(spacesLessSecret),
                logger,
                _logPrefix,
            );
        })()),

        notification: ({entryUrl, zoneName}) => {
            const _logPrefix = ["notification()", zoneName];
            logger.info(..._logPrefix);

            type LoggedInOutput = Required<Pick<AccountNotificationType<WebAccountTutanota>, "loggedIn">>;
            type PageTypeOutput = Required<Pick<AccountNotificationType<WebAccountTutanota>, "pageType">>;
            type UnreadOutput = Required<Pick<AccountNotificationType<WebAccountTutanota>, "unread">>;

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
                    concatMap(() => from((async () => {
                        const url = getLocationHref();
                        const pageType: PageTypeOutput["pageType"] = {url, type: "unknown"};
                        const loginUrlDetected = (url === `${entryUrl}/login` || url.startsWith(`${entryUrl}/login?`));

                        if (loginUrlDetected && !isLoggedIn()) {
                            let twoFactorElements;

                            try {
                                twoFactorElements = await waitElements(login2FaWaitElementsConfig, {iterationsLimit: 1});
                            } catch (e) {
                                // NOOP
                            }

                            const twoFactorCodeVisible = twoFactorElements
                                && twoFactorElements.input.offsetParent
                                && twoFactorElements.button.offsetParent;

                            if (twoFactorCodeVisible) {
                                pageType.type = "login2fa";
                            } else {
                                pageType.type = "login";
                            }
                        }

                        return {pageType};
                    })())),
                    distinctUntilChanged(({pageType: prev}, {pageType: curr}) => curr.type === prev.type),
                    tap((value) => logger.verbose(..._logPrefix, JSON.stringify(value))),
                ),

                // TODO listen for "unread" change instead of starting polling interval
                Observable.create((observer: Subscriber<UnreadOutput>) => {
                    const notifyUnreadValue = async () => {
                        const controller = getUserController();

                        if (!controller) {
                            return;
                        }

                        const folders = await fetchUserFoldersWithSubFolders(controller.user);
                        const inboxFolder = folders.find(({folderType}) => MailFolderTypeService.testValue(folderType, "inbox"));

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

                    setInterval(notifyUnreadValue, ONE_SECOND_MS * 60);
                    setTimeout(notifyUnreadValue, ONE_SECOND_MS * 15);
                }).pipe(
                    distinctUntilChanged(({unread: prev}, {unread: curr}) => curr === prev),
                ),
            ];

            return merge(...observables).pipe(
                shareReplay(1),
            );
        },
    };

    TUTANOTA_IPC_WEBVIEW_API.registerApi(endpoints);
    logger.verbose(`api registered, url: ${getLocationHref()}`);

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
}
