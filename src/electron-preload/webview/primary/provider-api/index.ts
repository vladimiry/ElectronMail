import {EMPTY, combineLatest} from "rxjs";
import {chunk} from "remeda";
import {distinctUntilChanged, first, map, mergeMap} from "rxjs/operators";

import {EncryptionPreferences, MessageKeys, ProviderApi} from "./model";
import {FETCH_NOTIFICATION_SKIP_SYMBOL} from "./const";
import {HttpApi, resolveStandardSetupPublicApi} from "src/electron-preload/webview/lib/provider-api/standart-setup-internals";
import {Logger} from "src/shared/model/common";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";
import {assertTypeOf, curryFunctionMembers} from "src/shared/util";
import {attachRateLimiting} from "./rate-limiting";
import {resolveProviderInternals} from "./internals";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, __filename);

const protonMaxPageSize = 150;

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
    const logger = curryFunctionMembers(_logger, nameof(initProviderApi));

    logger.info();

    return (async (): Promise<ProviderApi> => {
        const [standardSetupPublicApi, internals] = await Promise.all([
            resolveStandardSetupPublicApi(logger),
            resolveProviderInternals(),
        ]);
        const internalsPrivateScope$ = internals["./src/app/containers/PageContainer.tsx"].value$.pipe(distinctUntilChanged());
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
        const resolveHttpApi = async (): Promise<HttpApi> => standardSetupPublicApi.httpApi$.pipe(first()).toPromise();
        const providerApi: ProviderApi = {
            _custom_: {
                loggedIn$: combineLatest([
                    standardSetupPublicApi.authentication$,
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
                cachedMailSettingsModel$: standardSetupPublicApi.cache$.pipe(
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
                    const messageKeys = await privateApi.getMessageKeys(message);
                    const decryptedMessage = await internals["./src/app/helpers/message/messageDecrypt.ts"].value.decryptMessage(
                        message,
                        messageKeys.privateKeys,
                        privateApi.attachmentCache,
                    );

                    if (typeof decryptedMessage.decryptedBody !== "string") {
                        throw new Error("Invalid message body content");
                    }

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
                async markMessageAsRead(IDs) {
                    const api = await resolveHttpApi();
                    const {markMessageAsRead: apiMethod} = internals["./node_modules/proton-shared/lib/api/messages.js"].value;
                    await Promise.all(
                        chunk(IDs, protonMaxPageSize).map(async (IDsPortion) => api(apiMethod(IDsPortion))),
                    );
                },
                async labelMessages({LabelID, IDs}) {
                    const api = await resolveHttpApi();
                    const {labelMessages: apiMethod} = internals["./node_modules/proton-shared/lib/api/messages.js"].value;
                    await Promise.all(
                        chunk(IDs, protonMaxPageSize).map(async (IDsPortion) => api(apiMethod({IDs: IDsPortion, LabelID}))),
                    );
                },
                async deleteMessages(IDs) {
                    const api = await resolveHttpApi();
                    const {deleteMessages: apiMethod} = internals["./node_modules/proton-shared/lib/api/messages.js"].value;
                    await Promise.all(
                        chunk(IDs, protonMaxPageSize).map(async (IDsPortion) => api(apiMethod(IDsPortion)))
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
                    const constructExtendedMessage = (
                        encryptionPreferences: EncryptionPreferences,
                        messageKeys: MessageKeys,
                    ): Parameters<Unpacked<ReturnType<typeof resolvePrivateApi>>["getDecryptedAttachment"]>[1] => {
                        const extendedMessage: ReturnType<typeof constructExtendedMessage> = {
                            senderPinnedKeys: encryptionPreferences.pinnedKeys,
                            senderVerified: Boolean(encryptionPreferences.isContactSignatureVerified),
                            privateKeys: messageKeys.privateKeys,
                        };
                        // this proxy helps early detecting unexpected/not-yet-reviewed protonmail's "getDecryptedAttachment" behaviour
                        // if/likely-when the behaviour gets changed by protonmail
                        return new Proxy(
                            extendedMessage,
                            {
                                get(target, prop) {
                                    if (!(prop in extendedMessage)) {
                                        throw new Error([
                                            "Unexpected email message prop accessing detected",
                                            `during the attachment download (${JSON.stringify({prop})})`,
                                        ].join(" "));
                                    }
                                    return target[prop as keyof typeof target];
                                },
                                set(...[/* target */, prop]) {
                                    throw new Error(
                                        `Email message modifying during the attachment download detected (${JSON.stringify({prop})})`,
                                    );
                                }
                            },
                        );
                    };
                    const result: ProviderApi["attachmentLoader"]["getDecryptedAttachment"] = async (attachment, message) => {
                        const privateApi = await resolvePrivateApi();
                        const [protonApi, messageKeys, encryptionPreferences] = await Promise.all([
                            resolveHttpApi(),
                            privateApi.getMessageKeys(message),
                            privateApi.getEncryptionPreferences(message.Sender.Address),
                        ]);
                        const extendedMessage = constructExtendedMessage(encryptionPreferences, messageKeys);
                        const {data} = await privateApi.getDecryptedAttachment(attachment, extendedMessage, messageKeys, protonApi);

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
                    // https://github.com/ProtonMail/proton-mail/blob/d3ef340d820c51275310b7b8b3e13ff25193dece/src/app/containers/MailboxContainer.tsx#L147-L157
                    const history = await standardSetupPublicApi.history$.pipe(first()).toPromise();
                    const {setParamsInLocation} = internals["./src/app/helpers/mailboxUrl.ts"].value;
                    const resolvedUrl = conversationId
                        ? setParamsInLocation(history.location, {labelID: folderId, elementID: conversationId, messageID: mailId})
                        : setParamsInLocation(history.location, {labelID: folderId, elementID: mailId});

                    history.push(resolvedUrl);
                },
            },
        };

        // WARN: logging attaching should happen before attaching the rate limiting
        // since the rate limited thing should be a top-level wrapper, ie it should be called first when the app calls the api method
        attachLoggingBeforeCall(providerApi, logger);

        await attachRateLimiting(providerApi, logger);

        logger.info("initialized");

        return providerApi;
    })();
};
