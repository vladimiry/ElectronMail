import {chunk} from "remeda";
import {combineLatest, lastValueFrom} from "rxjs";
import {distinctUntilChanged, first, map} from "rxjs/operators";

import {attachRateLimiting} from "./rate-limiting";
import {curryFunctionMembers} from "src/shared/util";
import {FETCH_NOTIFICATION_SKIP_SYMBOL} from "./const";
import {HttpApi, resolveStandardSetupPublicApi} from "src/electron-preload/webview/lib/provider-api/standart-setup-internals";
import {Logger} from "src/shared/model/common";
import {MessageVerification, ProviderApi, VerificationPreferences} from "./model";
import {PROTON_MAX_QUERY_PORTION_LIMIT, WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";
import {resolveProviderInternals} from "./internals";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, __filename);

// TODO move function wrapping to utility function
const attachLoggingBeforeCall = (api: ProviderApi, logger: Logger): void => {
    for (const groupProp of Object.keys(api) as Array<keyof typeof api>) {
        const group = api[groupProp] as Record<string, unknown>;
        for (const groupMemberProp of Object.keys(group)) {
            const groupMember = group[groupMemberProp];
            if (
                typeof groupMember !== "function"
                || !Object.getOwnPropertyDescriptor(group, groupMemberProp)?.writable
            ) {
                continue;
            }
            group[groupMemberProp] = (...args: unknown[]) => {
                logger.verbose(`calling provider api function: ${groupProp}.${groupMemberProp}`);
                return groupMember(...args); // eslint-disable-line @typescript-eslint/no-unsafe-return
            };
        }
    }
};

export const initProviderApi = async (): Promise<ProviderApi> => {
    const logger = curryFunctionMembers(_logger, nameof(initProviderApi));

    logger.info();

    return (async (): Promise<ProviderApi> => {
        const [standardSetupPublicApi, internals] = await Promise.all([resolveStandardSetupPublicApi(logger), resolveProviderInternals()]);
        const internalsPrivateScope$ = internals["./src/app/containers/PageContainer.tsx"].value$.pipe(distinctUntilChanged());
        const resolvePrivateApi = async () => { // eslint-disable-line @typescript-eslint/explicit-function-return-type
            return lastValueFrom(internalsPrivateScope$.pipe(
                first(),
                map((value) => {
                    if (!value.privateScope) {
                        throw new Error(`Failed to resolve "private scope". This is an indication that the app logic is not perfect yet.`);
                    }
                    return value.privateScope;
                }),
            ));
        };
        const resolveHttpApi = async (): Promise<HttpApi> => lastValueFrom(standardSetupPublicApi.httpApi$.pipe(first()));
        const providerApi: ProviderApi = {
            _custom_: {
                loggedIn$: combineLatest([standardSetupPublicApi.authentication$, internalsPrivateScope$]).pipe(
                    map(([authentication, {privateScope}]) => {
                        const isPrivateScopeActive = Boolean(privateScope);
                        const isAuthenticationSessionActive = Boolean(authentication.hasSession?.call(authentication));
                        logger.verbose(JSON.stringify({isPrivateScopeActive, isAuthenticationSessionActive}));
                        return isPrivateScopeActive && isAuthenticationSessionActive;
                    }),
                    distinctUntilChanged(),
                ),
                async getMailSettingsModel() {
                    const privateApi = await resolvePrivateApi();
                    const [mailSettings /*, loadingMailSettings */] = privateApi.mailSettings;
                    return mailSettings;
                },
                buildEventsApiUrlTester(/*{entryApiUrl}*/) {
                    const substr = "/core/v5/events/";
                    return (url) => url.includes(substr);
                },
                buildMessagesCountApiUrlTester(/*{entryApiUrl}*/) {
                    const substr = "/mail/v4/messages/count";
                    return (url) => url.endsWith(substr);
                },
                async decryptMessage(message) {
                    const privateApi = await resolvePrivateApi();
                    const messageKeys = await privateApi.getMessageKeys(message);
                    const decryptMessage = await internals["./src/app/helpers/message/messageDecrypt.ts"].value.decryptMessage(
                        message,
                        messageKeys.privateKeys,
                    );
                    if (decryptMessage.errors) {
                        logger.error(decryptMessage.errors);
                        throw new Error("Failed to decrypt a message");
                    }
                    const {decryptedSubject, decryptedBody} = decryptMessage;
                    if (typeof decryptedBody !== "string") {
                        throw new Error("Invalid message body content");
                    }
                    return {decryptedSubject, decryptedBody};
                },
            },
            label: {
                async get(type) {
                    return (await resolveHttpApi())(internals["../../packages/shared/lib/api/labels.ts"].value.get(type));
                },
            },
            message: {
                async queryMessageCount() {
                    return (await resolveHttpApi())(internals["../../packages/shared/lib/api/messages.ts"].value.queryMessageCount());
                },
                async getMessage(id) {
                    return (await resolveHttpApi())(internals["../../packages/shared/lib/api/messages.ts"].value.getMessage(id));
                },
                async queryMessageMetadata(params) {
                    return (await resolveHttpApi())(
                        internals["../../packages/shared/lib/api/messages.ts"].value.queryMessageMetadata(params),
                    );
                },
                async markMessageAsRead(IDs) {
                    const api = await resolveHttpApi();
                    const {markMessageAsRead: apiMethod} = internals["../../packages/shared/lib/api/messages.ts"].value;

                    for (const idsChunk of chunk(IDs, PROTON_MAX_QUERY_PORTION_LIMIT)) {
                        await api(apiMethod(idsChunk));
                    }
                },
                async labelMessages({LabelID, IDs}) {
                    const api = await resolveHttpApi();
                    const {labelMessages: apiMethod} = internals["../../packages/shared/lib/api/messages.ts"].value;

                    for (const idsChunk of chunk(IDs, PROTON_MAX_QUERY_PORTION_LIMIT)) {
                        await api(apiMethod({IDs: idsChunk, LabelID}));
                    }
                },
                async deleteMessages(IDs) {
                    const api = await resolveHttpApi();
                    const {deleteMessages: apiMethod} = internals["../../packages/shared/lib/api/messages.ts"].value;

                    for (const idsChunk of chunk(IDs, PROTON_MAX_QUERY_PORTION_LIMIT)) {
                        await api(apiMethod(idsChunk));
                    }
                },
            },
            contact: {
                async queryContacts() {
                    return (await resolveHttpApi())(internals["../../packages/shared/lib/api/contacts.ts"].value.queryContacts());
                },
                async getContact(id) {
                    return (await resolveHttpApi())(internals["../../packages/shared/lib/api/contacts.ts"].value.getContact(id));
                },
            },
            events: {
                async getEvents(id) {
                    const originalParams = internals["../../packages/shared/lib/api/events.ts"].value.getEvents(id);
                    // the app listens for the "events" api calls to enable reactive syncing scenario
                    // so the api calls explicitly triggered by the app should not be listened to prevent infinity looping code issue
                    const additionParams = {[FETCH_NOTIFICATION_SKIP_SYMBOL]: FETCH_NOTIFICATION_SKIP_SYMBOL};

                    return (await resolveHttpApi())({...originalParams, ...additionParams});
                },
                async getLatestID() {
                    return (await resolveHttpApi())(internals["../../packages/shared/lib/api/events.ts"].value.getLatestID());
                },
            },
            attachmentLoader: {
                getDecryptedAttachment: (() => {
                    const buildVerification = (verificationPreferences: VerificationPreferences): NoExtraProps<MessageVerification> => {
                        const result = {verifyingKeys: verificationPreferences.verifyingKeys} as const;
                        // this proxy helps early detecting unexpected/not-yet-reviewed protonmail's "getDecryptedAttachment" behaviour
                        // if/likely-when the behaviour gets changed by protonmail
                        return new Proxy(result, {
                            get(target, prop) {
                                if (!(prop in result)) {
                                    throw new Error(
                                        [
                                            "Unexpected email message prop accessing detected",
                                            `during the attachment download (${JSON.stringify({prop})})`,
                                        ].join(" "),
                                    );
                                }
                                return target[prop as keyof typeof target];
                            },
                            set(...[/* target */, prop]) {
                                throw new Error(
                                    `Email message modifying during the attachment download detected (${JSON.stringify({prop})})`,
                                );
                            },
                        });
                    };
                    const result: ProviderApi["attachmentLoader"]["getDecryptedAttachment"] = async (attachment, message) => {
                        const privateApi = await resolvePrivateApi();
                        const contactEmailsMap = privateApi.contactsMap;
                        const [protonApi, messageKeys, verificationPreferences] = await Promise.all([
                            resolveHttpApi(),
                            privateApi.getMessageKeys(message),
                            privateApi.getVerificationPreferences({email: message.Sender.Address, lifetime: 0, contactEmailsMap}),
                        ]);
                        const verification = buildVerification(verificationPreferences);
                        const {data} = await privateApi.getDecryptedAttachment(attachment, verification, messageKeys, protonApi);

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
            constants: internals["../../packages/shared/lib/mail/mailSettings.ts"].value,
            history: {
                async push({folderId, conversationId, mailId}) {
                    // eslint-disable-next-line max-len
                    // https://github.com/ProtonMail/proton-mail/blob/d3ef340d820c51275310b7b8b3e13ff25193dece/src/app/containers/MailboxContainer.tsx#L147-L157
                    const history = await lastValueFrom(standardSetupPublicApi.history$.pipe(first()));
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
