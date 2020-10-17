import {EMPTY, combineLatest} from "rxjs";
import {distinctUntilChanged, first, map, mergeMap} from "rxjs/operators";

import {EncryptionPreferences, HttpApi, MessageKeys, ProviderApi} from "./model";
import {FETCH_NOTIFICATION_SKIP_SYMBOL} from "./const";
import {Logger} from "src/shared/model/common";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/constants";
import {assertTypeOf, curryFunctionMembers} from "src/shared/util";
import {attachRateLimiting} from "src/electron-preload/webview/primary/provider-api/rate-limiting";
import {resolveProviderInternals} from "src/electron-preload/webview/primary/provider-api/internals";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, "[provider-api/index]");

// TODO move function wrapping to utility function
const attachLoggingBeforeCall = (api: ProviderApi, logger: Logger): void => {
    for (const groupProp of Object.keys(api) as Array<keyof typeof api>) {
        const group = api[groupProp] as Record<string, unknown>;
        for (const groupMemberProp of Object.keys(group)) {
            const groupMember = group[groupMemberProp];
            if (typeof groupMember === "function") {
                group[groupMemberProp] = (...args: unknown[]) => {
                    logger.verbose(`calling provider api function: ${groupProp}.${groupMemberProp}`);
                    return groupMember(...args); // eslint-disable-line @typescript-eslint/no-unsafe-return
                };
            }
        }
    }
};

export const initProviderApi = async (): Promise<ProviderApi> => {
    const logger = curryFunctionMembers(_logger, "initProviderApi()");

    logger.info("init");

    return (async (): Promise<ProviderApi> => {
        const internals = await resolveProviderInternals();
        const internalsPublicApi = (() => { // eslint-disable-line @typescript-eslint/explicit-function-return-type
            const scope$ = internals["./node_modules/react-components/containers/app/StandardSetup.tsx"].value$
                .asObservable()
                .pipe(
                    map(({publicScope}) => publicScope),
                    distinctUntilChanged(),
                );
            return { // TODO set race-based timeout when members of this object get accessed/resolved
                httpApi$: scope$.pipe(
                    map(({httpApi}) => httpApi),
                    distinctUntilChanged(),
                ),
                authentication$: scope$.pipe(
                    map(({authentication}) => authentication),
                    distinctUntilChanged(),
                ),
                cache$: scope$.pipe(
                    map(({cache}) => cache),
                    distinctUntilChanged(),
                ),
                history$: scope$.pipe(
                    map(({history}) => history),
                    distinctUntilChanged(),
                ),
            } as const;
        })();
        const internalsPrivateScope$ = internals["./src/app/containers/PageContainer.tsx"].value$
            .asObservable()
            .pipe(distinctUntilChanged());
        const resolvePrivateApi = async () => { // eslint-disable-line @typescript-eslint/explicit-function-return-type
            return internalsPrivateScope$
                .pipe(
                    first(),
                    map((value) => {
                        if (!value.privateScope) {
                            throw new Error(
                                `Failed to resolve "private scope". This is an indication that the app logic is not perfect yet.`,
                            );
                        }
                        return value.privateScope;
                    }),
                )
                .toPromise();
        };
        const resolveHttpApi = async (): Promise<HttpApi> => internalsPublicApi.httpApi$.pipe(first()).toPromise();
        const providerApi: ProviderApi = {
            _custom_: {
                loggedIn$: combineLatest([
                    internalsPublicApi.authentication$,
                    internalsPrivateScope$,
                ]).pipe(
                    map(([authentication, {privateScope}]) => {
                        const isPrivateScopeActive = Boolean(privateScope);
                        const isAuthenticationSessionActive = Boolean(
                            authentication.hasSession?.call(authentication),
                        );
                        logger.verbose(JSON.stringify({isPrivateScopeActive, isAuthenticationSessionActive}));
                        return isPrivateScopeActive && isAuthenticationSessionActive;
                    }),
                    distinctUntilChanged(),
                ),
                cachedMailSettingsModel$: internalsPublicApi.cache$.pipe(
                    mergeMap((cache) => {
                        const cachedModel = cache.get<{
                            value: Unpacked<ProviderApi["_custom_"]["cachedMailSettingsModel$"]>
                            // eslint-disable-next-line max-len
                            // TODO pick "MailSettingsModel.status" type from https://github.com/ProtonMail/proton-shared/blob/137d769c6cd47337593d3a47302eb23245762154/lib/models/cache.ts
                            status: number
                        }>(
                            internals["./node_modules/proton-shared/lib/models/mailSettingsModel.js"].value.MailSettingsModel.key,
                        );
                        if (cachedModel?.value) {
                            assertTypeOf(
                                {value: cachedModel.value.ViewMode, expectedType: "number"},
                                `Invalid "mail settings model" detected`,
                            );
                            return [cachedModel.value];
                        }
                        return EMPTY;
                    }),
                    distinctUntilChanged(),
                ),
                buildEventsApiUrlTester({entryApiUrl}) {
                    const re = new RegExp(`^${entryApiUrl}/api/v4/events/.+$`);
                    return (url) => re.test(url);
                },
                buildMessagesCountApiUrlTester({entryApiUrl}) {
                    const re = new RegExp(`^${entryApiUrl}/api/mail/v4/messages/count$`);
                    return (url) => re.test(url);
                },
                async decryptMessageBody(message) {
                    const privateApi = await resolvePrivateApi();
                    const [messageKeys, encryptionPreferences] = await Promise.all([
                        privateApi.getMessageKeys({data: message}),
                        privateApi.getEncryptionPreferences(message.Sender.Address),
                    ]);
                    // eslint-disable-next-line max-len
                    // https://github.com/ProtonMail/proton-mail/blob/2ab916e847bfe8064f5ff321c50f1028adf547e1/src/app/helpers/message/messageDecrypt.ts#L96
                    const decryptedMessage = await internals["./src/app/helpers/message/messageDecrypt.ts"].value.decryptMessage(
                        message,
                        encryptionPreferences.pinnedKeys,
                        messageKeys.privateKeys,
                        privateApi.attachmentCache,
                    );
                    return decryptedMessage.decryptedBody;
                },
            },
            label: {
                async get(type) {
                    return (await resolveHttpApi())(
                        internals["./node_modules/proton-shared/lib/api/labels.ts"].value.get(type),
                    );
                },
            },
            conversation: {
                async getConversation(id) {
                    return (await resolveHttpApi())(
                        internals["./node_modules/proton-shared/lib/api/conversations.js"].value.getConversation(id),
                    );
                },
                async queryConversations(params) {
                    return (await resolveHttpApi())(
                        internals["./node_modules/proton-shared/lib/api/conversations.js"].value.queryConversations(params),
                    );
                },
            },
            message: {
                async getMessage(id) {
                    return (await resolveHttpApi())(
                        internals["./node_modules/proton-shared/lib/api/messages.js"].value.getMessage(id),
                    );
                },
                async queryMessageMetadata(params) {
                    return (await resolveHttpApi())(
                        internals["./node_modules/proton-shared/lib/api/messages.js"].value.queryMessageMetadata(params),
                    );
                },
                async markMessageAsRead(ids) {
                    return (await resolveHttpApi())(
                        internals["./node_modules/proton-shared/lib/api/messages.js"].value.markMessageAsRead(ids),
                    );
                },
                async labelMessages(params) {
                    return (await resolveHttpApi())(
                        internals["./node_modules/proton-shared/lib/api/messages.js"].value.labelMessages(params),
                    );
                },
                async deleteMessages(IDs) {
                    return (await resolveHttpApi())(
                        internals["./node_modules/proton-shared/lib/api/messages.js"].value.deleteMessages(IDs),
                    );
                },
            },
            contact: {
                async queryContacts() {
                    return (await resolveHttpApi())(
                        internals["./node_modules/proton-shared/lib/api/contacts.ts"].value.queryContacts(),
                    );
                },
                async getContact(id) {
                    return (await resolveHttpApi())(
                        internals["./node_modules/proton-shared/lib/api/contacts.ts"].value.getContact(id),
                    );
                },
            },
            events: {
                async getEvents(id) {
                    const originalParams = internals["./node_modules/proton-shared/lib/api/events.ts"].value.getEvents(id);
                    // the app listens for the "events" api calls to enable reactive syncing scenario
                    // so the api calls explicitly triggered by the app should not be listened to prevent infinity looping code issue
                    const additionParams = {[FETCH_NOTIFICATION_SKIP_SYMBOL]: FETCH_NOTIFICATION_SKIP_SYMBOL};

                    return (await resolveHttpApi())(
                        {...originalParams, ...additionParams},
                    );
                },
                async getLatestID() {
                    return (await resolveHttpApi())(
                        internals["./node_modules/proton-shared/lib/api/events.ts"].value.getLatestID(),
                    );
                },
            },
            attachmentLoader: {
                getDecryptedAttachment: (() => {
                    // WARN: notice the ordering correlation
                    const allowedExtendedMessageKeys = ["senderPinnedKeys", "senderVerified", "privateKeys"] as const;
                    const constructExtendedMessage = (
                        encryptionPreferences: EncryptionPreferences,
                        messageKeys: MessageKeys,
                    ): Parameters<Unpacked<ReturnType<typeof resolvePrivateApi>>["getDecryptedAttachment"]>[1] => {
                        const extendedMessage = { // WARN: notice the ordering correlation
                            [allowedExtendedMessageKeys[0]]: encryptionPreferences.pinnedKeys,
                            [allowedExtendedMessageKeys[1]]: encryptionPreferences.isContactSignatureVerified,
                            [allowedExtendedMessageKeys[2]]: messageKeys.privateKeys,
                        } as const;
                        // this proxy helps early detecting unexpected/not-yet-reviewed protonmail's "getDecryptedAttachment" behaviour
                        // if/likely-when it gets changed one day by them/protonmail
                        return new Proxy(extendedMessage, {
                            get(target: typeof extendedMessage, prop: keyof typeof target) {
                                if (!allowedExtendedMessageKeys.includes(prop)) {
                                    throw new Error([
                                        `Unexpected email message prop accessing detected`,
                                        `during the attachment download (${JSON.stringify(prop)})`,
                                    ].join(" "));
                                }
                                return target[prop];
                            },
                            set(...[/* target */, prop]) {
                                throw new Error(
                                    `Email message modifying during the attachment download detected (${JSON.stringify(prop)})`,
                                );
                            }
                        });
                    };
                    const result: ProviderApi["attachmentLoader"]["getDecryptedAttachment"] = async (attachment, message) => {
                        const privateApi = await resolvePrivateApi();
                        const [protonApi, messageKeys, encryptionPreferences] = await Promise.all([
                            resolveHttpApi(),
                            privateApi.getMessageKeys({data: message}),
                            privateApi.getEncryptionPreferences(message.Sender.Address),
                        ]);
                        const extendedMessage = constructExtendedMessage(encryptionPreferences, messageKeys);
                        const {data} = await privateApi.getDecryptedAttachment(attachment, extendedMessage, protonApi);

                        // the custom error also has the "data" prop, so this test won't suppress/override the custom error
                        // so this test should help detecting at early stage the protonmail's code change
                        if (typeof data === "undefined") {
                            throw new Error("Invalid attachments binary data");
                        }

                        return {data};
                    };
                    return result;
                })(),
            },
            constants: internals["./node_modules/proton-shared/lib/constants.ts"].value,
            history: {
                async push({folderId, conversationId, mailId}) {
                    // eslint-disable-next-line max-len
                    // https://github.com/ProtonMail/proton-mail/blob/2ab916e847bfe8064f5ff321c50f1028adf547e1/src/app/containers/MailboxContainer.tsx#L147-L150
                    const history = await internalsPublicApi.history$.pipe(first()).toPromise();
                    const {setPathInUrl} = internals["./src/app/helpers/mailboxUrl.ts"].value;
                    const resolvedUrl = conversationId
                        ? setPathInUrl(history.location, folderId, conversationId, mailId)
                        : setPathInUrl(history.location, folderId, mailId);

                    history.push(resolvedUrl);
                },
            },
        };

        // WARN: logging attaching should happen before attaching the rate limiting
        // since the rate limited thing should be a top-level wrapper, ie it should be called first when the app calls the api method
        attachLoggingBeforeCall(providerApi, logger);

        await attachRateLimiting(providerApi, logger);

        logger.info("initialized");

        return providerApi as any; // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
    })();
};
