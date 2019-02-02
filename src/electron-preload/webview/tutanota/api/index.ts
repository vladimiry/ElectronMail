import {EMPTY, Observable, from, interval, merge, of} from "rxjs";
import {authenticator} from "otplib";
import {buffer, concatMap, debounceTime, distinctUntilChanged, map, tap} from "rxjs/operators";
import {pick} from "ramda";

import * as Rest from "src/electron-preload/webview/tutanota/lib/rest";
import * as WebviewConstants from "src/electron-preload/webview/constants";
import {MAIL_FOLDER_TYPE} from "src/shared/model/database";
import {ONE_SECOND_MS} from "src/shared/constants";
import {TUTANOTA_IPC_WEBVIEW_API, TutanotaApi, TutanotaNotificationOutput} from "src/shared/api/webview/tutanota";
import {Unpacked} from "src/shared/types";
import {buildDbPatch, buildDbPatchEndpoint} from "./build-db-patch";
import {curryFunctionMembers, isEntityUpdatesPatchNotEmpty} from "src/shared/util";
import {fillInputValue, getLocationHref, resolveDomElements, resolveIpcMainApi, submitTotpToken} from "src/electron-preload/webview/util";
import {getUserController, isLoggedIn} from "src/electron-preload/webview/tutanota/lib/util";
import {resolveProviderApi} from "src/electron-preload/webview/tutanota/lib/provider-api";

const _logger = curryFunctionMembers(WebviewConstants.WEBVIEW_LOGGERS.tutanota, "[api/index]");

export async function registerApi(): Promise<void> {
    return resolveProviderApi()
        .then(bootstrapEndpoints)
        .then((endpoints) => {
            TUTANOTA_IPC_WEBVIEW_API.registerApi(endpoints, {logger: {error: _logger.error, info: () => {}}});
        });
}

function bootstrapEndpoints(api: Unpacked<ReturnType<typeof resolveProviderApi>>): TutanotaApi {
    _logger.info("bootstrapEndpoints");

    const {GENERATED_MAX_ID} = api["src/api/common/EntityFunctions"];
    const login2FaWaitElementsConfig = {
        input: () => document.querySelector("#modal input.input") as HTMLInputElement,
        button: () => document.querySelector("#modal .flex-half.justify-end > button") as HTMLElement,
    };
    const endpoints: TutanotaApi = {
        ...buildDbPatchEndpoint,

        ping: () => of(null),

        selectAccount: ({databaseView, zoneName}) => from((async (logger = curryFunctionMembers(_logger, "select()", zoneName)) => {
            logger.info();

            await (await resolveIpcMainApi())("selectAccount")({databaseView}).toPromise();

            return null;
        })()),

        selectMailOnline: (input) => from((async (logger = curryFunctionMembers(_logger, "selectMailOnline()", input.zoneName)) => {
            logger.info();

            const {tutao} = window;
            const mailId = input.mail.id;
            const [folderId] = input.mail.mailFolderIds;

            if (!tutao) {
                throw new Error(`Failed to resolve "tutao" service`);
            }

            tutao.m.route.set(`/mail/${folderId}/${mailId}`);

            return null;
        })()),

        fillLogin: ({login, zoneName}) => from((async (logger = curryFunctionMembers(_logger, "fillLogin()", zoneName)) => {
            logger.info();

            const cancelEvenHandler = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
            };
            const elements = await resolveDomElements({
                username: () => document.querySelector("form [type=email]") as HTMLInputElement,
                storePasswordCheckbox: () => document.querySelector("form .items-center [type=checkbox]") as HTMLInputElement,
                storePasswordCheckboxBlock: () => document.querySelector("form .checkbox.pt.click") as HTMLInputElement,
            });
            logger.verbose(`elements resolved`);

            await fillInputValue(elements.username, login);
            elements.username.readOnly = true;
            logger.verbose(`input values filled`);

            elements.storePasswordCheckbox.checked = false;
            elements.storePasswordCheckbox.disabled = true;
            elements.storePasswordCheckboxBlock.removeEventListener("click", cancelEvenHandler);
            elements.storePasswordCheckboxBlock.addEventListener("click", cancelEvenHandler, true);
            logger.verbose(`"store" checkbox disabled`);

            return null;
        })()),

        login: ({login, password, zoneName}) => from((async (logger = curryFunctionMembers(_logger, "login()", zoneName)) => {
            logger.info();

            await endpoints.fillLogin({login, zoneName}).toPromise();
            logger.verbose(`fillLogin() executed`);

            const elements = await resolveDomElements({
                password: () => document.querySelector("form [type=password]") as HTMLInputElement,
                submit: () => document.querySelector("form button") as HTMLElement,
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

        login2fa: ({secret, zoneName}) => from((async () => {
            const logger = curryFunctionMembers(_logger, "login2fa()", zoneName);
            logger.info();

            const elements = await resolveDomElements(login2FaWaitElementsConfig);
            logger.verbose(`elements resolved`);

            const spacesLessSecret = secret.replace(/\s/g, "");

            return await submitTotpToken(
                elements.input,
                elements.button,
                () => authenticator.generate(spacesLessSecret),
                logger,
            );
        })()),

        notification: ({entryUrl, zoneName}) => {
            const logger = curryFunctionMembers(_logger, "notification()", zoneName);
            logger.info();

            type LoggedInOutput = Required<Pick<TutanotaNotificationOutput, "loggedIn">>;
            type PageTypeOutput = Required<Pick<TutanotaNotificationOutput, "pageType">>;
            type UnreadOutput = Required<Pick<TutanotaNotificationOutput, "unread">>;
            type BatchEntityUpdatesCounterOutput = Required<Pick<TutanotaNotificationOutput, "batchEntityUpdatesCounter">>;

            // TODO add "entity event batches" listening notification instead of the polling
            // so app reacts to the mails/folders updates instantly

            const observables: [
                Observable<LoggedInOutput>,
                Observable<PageTypeOutput>,
                Observable<UnreadOutput>,
                Observable<BatchEntityUpdatesCounterOutput>
                ] = [
                interval(WebviewConstants.NOTIFICATION_LOGGED_IN_POLLING_INTERVAL).pipe(
                    map(() => isLoggedIn()),
                    distinctUntilChanged(),
                    map((loggedIn) => ({loggedIn})),
                ),

                // TODO listen for location.href change instead of starting polling interval
                interval(WebviewConstants.NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL).pipe(
                    concatMap(() => from((async () => {
                        const url = getLocationHref();
                        const pageType: PageTypeOutput["pageType"] = {url, type: "unknown"};
                        const loginUrlDetected = (url === `${entryUrl}/login` || url.startsWith(`${entryUrl}/login?`));

                        if (loginUrlDetected && !isLoggedIn()) {
                            let twoFactorElements;

                            try {
                                twoFactorElements = await resolveDomElements(login2FaWaitElementsConfig, {iterationsLimit: 1});
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
                    tap((value) => logger.verbose(JSON.stringify(value))),
                ),

                // TODO listen for "unread" change instead of starting polling interval
                new Observable<UnreadOutput>((subscriber) => {
                    const notifyUnreadValue = async () => {
                        const controller = getUserController();

                        if (!controller || !isLoggedIn() || !navigator.onLine) {
                            return;
                        }

                        const folders = await Rest.Util.fetchMailFoldersWithSubFolders(controller.user);
                        const inboxFolder = folders.find(({folderType}) => folderType === MAIL_FOLDER_TYPE.INBOX);

                        if (!inboxFolder) {
                            return;
                        }

                        const emails = await Rest.fetchEntitiesRange(
                            Rest.Model.MailTypeRef,
                            inboxFolder.mails,
                            {count: 50, reverse: true, start: GENERATED_MAX_ID},
                        );
                        const unread = emails.reduce((sum, mail) => sum + Number(mail.unread), 0);

                        subscriber.next({unread});
                    };

                    setInterval(notifyUnreadValue, ONE_SECOND_MS * 60);
                    setTimeout(notifyUnreadValue, ONE_SECOND_MS * 15);
                }).pipe(
                    // all the values need to be sent to stream to get proper unread value after disabling database syncing
                    // distinctUntilChanged(({unread: prev}, {unread: curr}) => curr === prev),
                ),

                (() => {
                    const innerLogger = curryFunctionMembers(logger, `[entity update notification]`);
                    const notification = {batchEntityUpdatesCounter: 0};
                    const notificationReceived$ = new Observable<Pick<Rest.Model.EntityEventBatch, "events">>((
                        notificationReceivedSubscriber,
                    ) => {
                        const {EntityEventController} = api["src/api/main/EntityEventController"];
                        EntityEventController.prototype.notificationReceived = ((
                            original = EntityEventController.prototype.notificationReceived,
                        ) => {
                            const overridden: typeof EntityEventController.prototype.notificationReceived = function(
                                this: typeof EntityEventController,
                                entityUpdates,
                                // tslint:disable-next-line:trailing-comma
                                ...rest
                            ) {
                                entityUpdates
                                    .map((entityUpdate) => pick(["application", "type", "operation"], entityUpdate))
                                    .forEach((entityUpdate) => innerLogger.debug(JSON.stringify(entityUpdate)));
                                notificationReceivedSubscriber.next({events: entityUpdates});
                                return original.call(this, entityUpdates, ...rest);
                            };
                            return overridden;
                        })();
                    });

                    return notificationReceived$.pipe(
                        buffer(notificationReceived$.pipe(
                            debounceTime(ONE_SECOND_MS * 1.5),
                        )),
                        concatMap((eventBatches) => from(buildDbPatch({eventBatches, parentLogger: innerLogger}, true))),
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

    return endpoints;
}
