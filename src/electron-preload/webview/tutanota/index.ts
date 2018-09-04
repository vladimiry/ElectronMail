import {Observable, Subscriber, from, interval, merge, of} from "rxjs";
import {authenticator} from "otplib";
import {concatMap, distinctUntilChanged, map, tap} from "rxjs/operators";
import {pick} from "ramda";

import * as Database from "./lib/database";
import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "./lib/rest";
import {BatchEntityUpdatesDbPatch} from "src/shared/api/common";
import {MAIL_FOLDER_TYPE} from "src/shared/model/database";
import {
    NOTIFICATION_LOGGED_IN_POLLING_INTERVAL,
    NOTIFICATION_PAGE_TYPE_POLLING_INTERVAL,
    WEBVIEW_LOGGERS,
} from "src/electron-preload/webview/constants";
import {ONE_SECOND_MS} from "src/shared/constants";
import {TUTANOTA_IPC_WEBVIEW_API, TutanotaApi, TutanotaNotificationOutput} from "src/shared/api/webview/tutanota";
import {Unpacked} from "src/shared/types";
import {buildLoggerBundle} from "src/electron-preload/util";
import {curryFunctionMembers} from "src/shared/util";
import {fetchEntitiesRange} from "src/electron-preload/webview/tutanota/lib/rest";
import {fillInputValue, getLocationHref, submitTotpToken, waitElements} from "src/electron-preload/webview/util";
import {resolveApi} from "src/electron-preload/webview/tutanota/lib/api";

const WINDOW = window as any;
const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, "[index]");

resolveApi()
    .then(bootstrapApi)
    .catch(_logger.error);

function bootstrapApi(api: Unpacked<ReturnType<typeof resolveApi>>) {
    delete WINDOW.Notification;

    const {GENERATED_MAX_ID} = api["src/api/common/EntityFunctions"];
    const login2FaWaitElementsConfig = {
        input: () => document.querySelector("#modal input.input") as HTMLInputElement,
        button: () => document.querySelector("#modal input.input ~ div > button") as HTMLElement,
    };
    const endpoints: TutanotaApi = {
        ping: () => of(null),

        buildBatchEntityUpdatesDbPatch: (input) => from((async () => {
            const logger = curryFunctionMembers(_logger, "entityEventBatchesFetch()", input.zoneName);
            logger.info();

            const controller = getUserController();

            if (!controller) {
                throw new Error("User controller is supposed to be defined");
            }

            const eventBatches: Rest.Model.EntityEventBatch[] = [];
            const metadata: Required<Pick<DatabaseModel.MemoryDbAccount<"tutanota">["metadata"], "groupEntityEventBatchIds">> = {
                groupEntityEventBatchIds: {},
            };
            const memberships = Rest.Util.filterSyncingMemberships(controller.user);

            for (const {group} of memberships) {
                const startId = await Rest.Util.generateStartId(
                    input.metadata ? input.metadata.groupEntityEventBatchIds[group] : undefined,
                );
                const fetchedEventBatches = await Rest.fetchEntitiesRangeUntilTheEnd(
                    Rest.Model.EntityEventBatchTypeRef,
                    group,
                    {start: startId, count: 500},
                );
                if (fetchedEventBatches.length) {
                    metadata.groupEntityEventBatchIds[group] =
                        Rest.Util.resolveInstanceId(fetchedEventBatches[fetchedEventBatches.length - 1]);
                }
                eventBatches.push(...fetchedEventBatches);
            }
            logger.verbose(
                `fetched ${eventBatches.length} entity event batches from ${memberships.length} syncing memberships`,
            );

            const patch = await buildBatchEntityUpdatesDbPatch({eventBatches, _logger: logger});

            return {
                ...patch,
                metadata,
            };
        })()),

        fillLogin: ({login, zoneName}) => from((async () => {
            const logger = curryFunctionMembers(_logger, "fillLogin()", zoneName);
            logger.info();

            const cancelEvenHandler = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
            };
            const elements = await waitElements({
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

        login: ({password: passwordValue, login, zoneName}) => from((async () => {
            const logger = curryFunctionMembers(_logger, "login()", zoneName);
            logger.info();

            await endpoints.fillLogin({login, zoneName}).toPromise();
            logger.verbose(`fillLogin() executed`);

            const elements = await waitElements({
                password: () => document.querySelector("form [type=password]") as HTMLInputElement,
                submit: () => document.querySelector("form button") as HTMLElement,
            });
            logger.verbose(`elements resolved`);

            if (elements.password.value) {
                throw new Error(`Password is not supposed to be filled already on "login" stage`);
            }

            await fillInputValue(elements.password, passwordValue);
            logger.verbose(`input values filled`);

            elements.submit.click();
            logger.verbose(`clicked`);

            return null;
        })()),

        login2fa: ({secret, zoneName}) => from((async () => {
            const logger = curryFunctionMembers(_logger, "login2fa()", zoneName);
            logger.info();

            const elements = await waitElements(login2FaWaitElementsConfig);
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
                    tap((value) => logger.verbose(JSON.stringify(value))),
                ),

                // TODO listen for "unread" change instead of starting polling interval
                Observable.create((observer: Subscriber<UnreadOutput>) => {
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

                        const emails = await fetchEntitiesRange(
                            Rest.Model.MailTypeRef,
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

                Observable.create((subscriber: Subscriber<BatchEntityUpdatesCounterOutput>) => {
                    const innerLogger = curryFunctionMembers(logger, `[entity update notification]`);
                    const notification = {batchEntityUpdatesCounter: 0};
                    const {EntityEventController} = api["src/api/main/EntityEventController"];

                    EntityEventController.prototype.notificationReceived = ((original) => function(
                        this: typeof EntityEventController,
                        entityUpdate: Rest.Model.EntityUpdate,
                    ) {
                        (async () => {
                            innerLogger.verbose(JSON.stringify(pick(["application", "type", "operation"], entityUpdate)));

                            const {folders, mails, contacts} = await buildBatchEntityUpdatesDbPatch(
                                {eventBatches: [{events: [entityUpdate]}]/*, _logger: logger*/},
                                // mocking db model builders, we only need the data structure to be formed at this point
                                // so no need to produce unnecessary fetch requests
                                {mail: async () => null as any, folder: async () => null as any, contact: async () => null as any},
                            );

                            if (![
                                mails.remove,
                                mails.upsert,
                                folders.remove,
                                folders.upsert,
                                contacts.remove,
                                contacts.upsert,
                            ].some(({length}) => Boolean(length))) {
                                return;
                            }

                            notification.batchEntityUpdatesCounter++;
                            subscriber.next(notification);

                            innerLogger.info(`upsert/remove mails: ${mails.upsert.length}/${mails.remove.length}`);
                            innerLogger.info(`upsert/remove folders: ${folders.upsert.length}/${folders.remove.length}`);
                            innerLogger.info(`upsert/remove contacts: ${contacts.upsert.length}/${contacts.remove.length}`);
                        })().catch((error) => {
                            subscriber.error(error);
                            innerLogger.error(error);
                        });

                        return original.apply(this, arguments);
                    })(EntityEventController.prototype.notificationReceived);
                }),
            ];

            return merge(...observables);
        },
    };

    TUTANOTA_IPC_WEBVIEW_API.registerApi(endpoints);
    _logger.verbose(`api registered, url: ${getLocationHref()}`);
}

async function buildBatchEntityUpdatesDbPatch(
    input: {
        eventBatches: Array<Pick<Rest.Model.EntityEventBatch, "events">>;
        _logger?: ReturnType<typeof buildLoggerBundle>;
    },
    dbModelBuilders: {
        mail: (id: { instanceListId: Rest.Model.Id, instanceId: Rest.Model.Id }) => Promise<DatabaseModel.Mail>;
        folder: (id: { instanceListId: Rest.Model.Id, instanceId: Rest.Model.Id }) => Promise<DatabaseModel.Folder>;
        contact: (id: { instanceListId: Rest.Model.Id, instanceId: Rest.Model.Id }) => Promise<DatabaseModel.Contact>;
    } = {
        mail: async ({instanceListId, instanceId}) => {
            const mail = await Rest.fetchEntity(Rest.Model.MailTypeRef, [instanceListId, instanceId]);
            return await Database.buildMail(mail);
        },
        folder: async ({instanceListId, instanceId}) => {
            const folder = await Rest.fetchEntity(Rest.Model.MailFolderTypeRef, [instanceListId, instanceId]);
            return Database.buildFolder(folder);
        },
        contact: async ({instanceListId, instanceId}) => {
            const contact = await Rest.fetchEntity(Rest.Model.ContactTypeRef, [instanceListId, instanceId]);
            return Database.buildContact(contact);
        },
    },
): Promise<BatchEntityUpdatesDbPatch> {
    const logger = input._logger
        ? curryFunctionMembers(input._logger, "buildBatchEntityUpdatesDbPatch()")
        : {info: (...args: any[]) => {}, verbose: (...args: any[]) => {}};

    const mailsMap: Map<Rest.Model.Mail["_id"][1], Rest.Model.EntityUpdate[]> = new Map();
    const foldersMap: Map<Rest.Model.MailFolder["_id"][1], Rest.Model.EntityUpdate[]> = new Map();
    const contactsMap: Map<Rest.Model.Contact["_id"][1], Rest.Model.EntityUpdate[]> = new Map();

    for (const entitiesUpdate of input.eventBatches) {
        for (const event of entitiesUpdate.events) {
            // TODO replace if blocks by iteration based processing or pattern matching
            if (Rest.Util.sameRefType(Rest.Model.MailTypeRef, event)) {
                mailsMap.set(event.instanceId, [...(mailsMap.get(event.instanceId) || []), event]);
            } else if (Rest.Util.sameRefType(Rest.Model.MailFolderTypeRef, event)) {
                foldersMap.set(event.instanceId, [...(foldersMap.get(event.instanceId) || []), event]);
            } else if (Rest.Util.sameRefType(Rest.Model.ContactTypeRef, event)) {
                contactsMap.set(event.instanceId, [...(contactsMap.get(event.instanceId) || []), event]);
            }
        }
    }

    logger.verbose(`resolved: ${mailsMap.size} unique mails; ${foldersMap.size} unique folders; ${contactsMap.size} unique contacts`);

    const databasePatch: BatchEntityUpdatesDbPatch = {
        mails: {remove: [], upsert: []},
        folders: {remove: [], upsert: []},
        contacts: {remove: [], upsert: []},
    };
    const entitiesUpdatesGroups: Array<{
        entitiesUpdates: IterableIterator<Rest.Model.EntityUpdate[]>;
        upsert: (update: Rest.Model.EntityUpdate) => Promise<void>;
        remove: (pk: { pk: ReturnType<typeof Database.buildPk> }) => void;
    }> = [
        {
            entitiesUpdates: mailsMap.values(),
            upsert: async (update) => {
                databasePatch.mails.upsert.push(await dbModelBuilders.mail(update));
            },
            remove: (pk) => {
                databasePatch.mails.remove.push(pk);
            },
        },
        {
            entitiesUpdates: foldersMap.values(),
            upsert: async (update) => {
                databasePatch.folders.upsert.push(await dbModelBuilders.folder(update));
            },
            remove: (pk) => {
                databasePatch.folders.remove.push(pk);
            },
        },
        {
            entitiesUpdates: contactsMap.values(),
            upsert: async (update) => {
                databasePatch.contacts.upsert.push(await dbModelBuilders.contact(update));
            },
            remove: (pk) => {
                databasePatch.contacts.remove.push(pk);
            },
        },
    ];

    for (const {entitiesUpdates, upsert, remove} of entitiesUpdatesGroups) {
        for (const entityUpdates of entitiesUpdates) {
            let added = false;
            // entity updates sorted in ASC order, so reversing the entity updates list in order to fetch only the newest entity
            for (const update of entityUpdates.reverse()) {
                if (!added && [DatabaseModel.OPERATION_TYPE.CREATE, DatabaseModel.OPERATION_TYPE.UPDATE].includes(update.operation)) {
                    await upsert(update);
                    added = true;
                }
                if ([DatabaseModel.OPERATION_TYPE.DELETE].includes(update.operation)) {
                    remove({pk: Database.buildPk([update.instanceListId, update.instanceId])});
                    break;
                }
            }
        }
    }

    logger.info(`upsert/remove mails: ${databasePatch.mails.upsert.length}/${databasePatch.mails.remove.length}`);
    logger.info(`upsert/remove folders: ${databasePatch.folders.upsert.length}/${databasePatch.folders.remove.length}`);
    logger.info(`upsert/remove contacts: ${databasePatch.contacts.upsert.length}/${databasePatch.contacts.remove.length}`);

    return databasePatch;
}

function getUserController(): { accessToken: string, user: Rest.Model.User } | null {
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
