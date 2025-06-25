import {AddInitializedProp, DefineObservableValue, WrapToValueProp} from "src/electron-preload/webview/primary/lib/provider-api/model";
import * as DatabaseModel from "src/shared/model/database/index";
import {HttpApi, HttpApiArg} from "src/electron-preload/webview/primary/lib/provider-api/standart-setup-internals/model";
import {PROVIDER_REPO_MAP, PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS} from "src/shared/const/proton-apps";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";

/* eslint-disable max-len */

export type Keys = StrictExclude<
    (typeof PROVIDER_REPO_MAP)["proton-mail"]["protonPack"]["webpackIndexEntryItems"][number],
    typeof PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS[number]
>;

export type LazyKeys = StrictExclude<
    StrictExtract<
        Keys,
        | "../../packages/components/hooks/useGetVerificationPreferences.ts"
        | "../../packages/mail/store/mailSettings/hooks.ts"
        | "./src/app/helpers/attachment/attachmentLoader.ts"
        | "./src/app/hooks/message/useGetMessageKeys.ts"
        | "./src/app/hooks/contact/useContacts.ts"
    >,
    never
>;

export type ImmediateKeys = StrictExclude<Keys, LazyKeys>;

// TODO clone the proton project on npm postinstall hook and reference the modules signatures from their typescript code
//      like: typeof import("output/git/proton-mail/src/app/containers/PageContainer.tsx")
export type ProviderInternals = AddInitializedProp<
    & {
        [K in StrictExtract<ImmediateKeys, "./src/app/components/layout/PrivateLayout.tsx">]: DefineObservableValue<
            {
                readonly privateScope: null | {
                    // https://github.com/ProtonMail/WebClients/blob/a3e170b4831899c1bc6cda3bea20b668a7670541/packages/components/hooks/useGetVerificationPreferences.ts#L31
                    readonly getVerificationPreferences: (
                        attr: {
                            email: RestModel.Message["Sender"]["Address"];
                            lifetime?: number;
                            contactEmailsMap?: {[email: string]: RestModel.ContactEmail | undefined};
                        },
                    ) => Promise<VerificationPreferences>;
                    // https://github.com/ProtonMail/WebClients/blob/a3e170b4831899c1bc6cda3bea20b668a7670541/applications/mail/src/app/hooks/useMailModel.ts
                    readonly mailSettings: [mailSettings: {ViewMode: unknown}, loadingMailSettings?: boolean];
                    // https://github.com/ProtonMail/proton-mail/blob/77b133013cdb5695aa23c0c4c29cc6578878faa5/src/app/hooks/message/useGetMessageKeys.ts#L13
                    readonly getMessageKeys: (message: Pick<RestModel.Message, "AddressID">) => Promise<MessageKeys>;
                    // https://github.com/ProtonMail/proton-mail/blob/77b133013cdb5695aa23c0c4c29cc6578878faa5/src/app/helpers/attachment/attachmentLoader.ts#L46
                    readonly getDecryptedAttachment: (
                        attachment: RestModel.Attachment,
                        verification: MessageExtended["verification"] | undefined,
                        messageKeys: MessageKeys,
                        api: HttpApi,
                    ) => Promise<{data: Uint8Array}>;
                    // https://github.com/ProtonMail/WebClients/blob/a3e170b4831899c1bc6cda3bea20b668a7670541/applications/mail/src/app/hooks/contact/useContacts.ts#L11
                    readonly contactsMap: {[email: string]: RestModel.ContactEmail | undefined};
                };
            },
            (arg: unknown) => import("react").ReactNode
        >;
    }
    & WrapToValueProp<
        & {
            [K in StrictExtract<ImmediateKeys, "./src/app/helpers/message/messageDecrypt.ts">]: {
                // https://github.com/ProtonMail/WebClients/blob/6a18ff6f6b95c141a22adfeacb3a3ab00519e435/applications/mail/src/app/helpers/message/messageDecrypt.ts#L100
                readonly decryptMessage: (
                    message: RestModel.Message,
                    privateKeys: MessageKeys["decryptionKeys"],
                    // onUpdateAttachment?: (ID: string, attachment: DecryptedAttachment) => void,
                    // password?: string
                ) => Promise<
                    Readonly<{
                        decryptedBody: string;
                        // decryptedRawContent: Uint8Array;
                        // attachments?: Attachment[];
                        decryptedSubject?: string;
                        // signature?: OpenPGPSignature;
                        errors?: unknown;
                        // mimetype?: MIME_TYPES;
                    }>
                >;
            };
        }
        & {
            [K in StrictExtract<ImmediateKeys, "../../packages/shared/lib/mail/mailSettings.ts">]: {
                readonly VIEW_MODE: {readonly GROUP: number; readonly SINGLE: number};
            };
        }
        & {
            [K in StrictExtract<ImmediateKeys, "../../packages/shared/lib/api/labels.ts">]: {
                readonly get: (type?: RestModel.Label["Type"]) => HttpApiArg;
            };
        }
        & {
            [K in StrictExtract<ImmediateKeys, "../../packages/shared/lib/api/messages.ts">]: {
                readonly queryMessageCount: () => HttpApiArg;
                readonly getMessage: (id: RestModel.Message["ID"]) => HttpApiArg;
                readonly queryMessageMetadata: (
                    params?: RestModel.QueryParams & {LabelID?: Unpacked<RestModel.Message["LabelIDs"]>},
                ) => HttpApiArg;
                readonly markMessageAsRead: (ids: ReadonlyArray<RestModel.Message["ID"]>) => HttpApiArg;
                readonly labelMessages: (arg: {LabelID: RestModel.Label["ID"]; IDs: ReadonlyArray<RestModel.Message["ID"]>}) => HttpApiArg;
                readonly deleteMessages: (IDs: ReadonlyArray<RestModel.Message["ID"]>) => HttpApiArg;
            };
        }
        & {
            [K in StrictExtract<ImmediateKeys, "../../packages/shared/lib/api/contacts.ts">]: {
                readonly queryContacts: () => HttpApiArg;
                readonly getContact: (id: RestModel.Contact["ID"]) => HttpApiArg;
            };
        }
        & {
            [K in StrictExtract<ImmediateKeys, "../../packages/shared/lib/api/events.ts">]: {
                readonly getEvents: (id: RestModel.Event["EventID"]) => HttpApiArg;
                readonly getLatestID: () => HttpApiArg;
            };
        }
        & {
            [K in StrictExtract<ImmediateKeys, "./src/app/helpers/mailboxUrl.ts">]: {
                readonly setParamsInLocation: (location: ReturnType<typeof import("react-router").useHistory>["location"], params: {
                    labelID: RestModel.Label["ID"];
                    // eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
                    elementID?: RestModel.Conversation["ID"] | RestModel.Message["ID"];
                    messageID?: RestModel.Message["ID"];
                }) => Location;
            };
        }
    >
>;

type PrivateScope = StrictExclude<
    Unpacked<ProviderInternals["./src/app/components/layout/PrivateLayout.tsx"]["value$"]>["privateScope"],
    null
>;

export type ProviderInternalsLazy = AddInitializedProp<
    & {
        [K in StrictExtract<LazyKeys, "../../packages/components/hooks/useGetVerificationPreferences.ts">]: {
            default: () => PrivateScope["getVerificationPreferences"];
        };
    }
    & {
        [K in StrictExtract<LazyKeys, "./src/app/hooks/message/useGetMessageKeys.ts">]: {
            useGetMessageKeys: () => PrivateScope["getMessageKeys"];
        };
    }
    & { [K in StrictExtract<LazyKeys, "./src/app/hooks/contact/useContacts.ts">]: {useContactsMap: () => PrivateScope["contactsMap"]} }
    & {
        [K in StrictExtract<LazyKeys, "../../packages/mail/store/mailSettings/hooks.ts">]: {
            useMailSettings: () => PrivateScope["mailSettings"];
        };
    }
    & {
        [K in StrictExtract<LazyKeys, "./src/app/helpers/attachment/attachmentLoader.ts">]: {
            getDecryptedAttachment: PrivateScope["getDecryptedAttachment"];
        };
    }
>;

export type ProviderApi =
    & {_throwErrorOnRateLimitedMethodCall?: boolean}
    & Readonly<
        {
            _custom_: Readonly<
                {
                    getMailSettingsModel: () => Promise<{ViewMode: unknown}>;
                    buildEventsApiUrlTester: (options: {entryApiUrl: string}) => (url: string) => boolean;
                    buildMessagesCountApiUrlTester: (options: {entryApiUrl: string}) => (url: string) => boolean;
                    decryptMessage: (message: RestModel.Message) => Promise<{decryptedSubject?: string; decryptedBody: string}>;
                }
            >;
            constants: ProviderInternals["../../packages/shared/lib/mail/mailSettings.ts"]["value"];
            label: Readonly<
                {
                    get: (
                        ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/labels.ts"]["value"]["get"]>
                    ) => Promise<RestModel.LabelsResponse>;
                }
            >;
            message: Readonly<
                {
                    queryMessageCount: (
                        ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/messages.ts"]["value"]["queryMessageCount"]>
                    ) => Promise<RestModel.MessagesCountResponse>;
                    getMessage: (
                        ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/messages.ts"]["value"]["getMessage"]>
                    ) => Promise<RestModel.MessageResponse>;
                    queryMessageMetadata: (
                        ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/messages.ts"]["value"]["queryMessageMetadata"]>
                    ) => Promise<RestModel.MessagesResponse>;
                    markMessageAsRead: (
                        ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/messages.ts"]["value"]["markMessageAsRead"]>
                    ) => Promise<void>;
                    labelMessages: (
                        ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/messages.ts"]["value"]["labelMessages"]>
                    ) => Promise<void>;
                    deleteMessages: (
                        ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/messages.ts"]["value"]["deleteMessages"]>
                    ) => Promise<void>;
                }
            >;
            contact: Readonly<
                {
                    queryContacts: (
                        ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/contacts.ts"]["value"]["queryContacts"]>
                    ) => Promise<RestModel.ContactsResponse>;
                    getContact: (
                        ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/contacts.ts"]["value"]["getContact"]>
                    ) => Promise<RestModel.ContactResponse>;
                }
            >;
            events: Readonly<
                {
                    getEvents: (
                        ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/events.ts"]["value"]["getEvents"]>
                    ) => Promise<RestModel.EventResponse>;
                    getLatestID: (
                        ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/events.ts"]["value"]["getLatestID"]>
                    ) => Promise<RestModel.LatestEventResponse>;
                }
            >;
            attachmentLoader: Readonly<
                {
                    getDecryptedAttachment: (
                        attachment: RestModel.Attachment,
                        message: RestModel.Message,
                    ) => Promise<NoExtraProps<{data: Uint8Array}>>;
                }
            >;
            history: Readonly<{
                push: (options: {
                    // eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
                    conversationId?: DatabaseModel.ConversationEntry["id"] | DatabaseModel.Mail["id"];
                    mailId?: DatabaseModel.Mail["id"];
                    folderId: DatabaseModel.Folder["id"];
                }) => Promise<void>;
            }>;
        }
    >;

export interface VerificationPreferences {
    verifyingKeys?: readonly unknown[];
}

export interface MessageKeys {
    readonly decryptionKeys: readonly unknown[];
}

export interface MessageVerification {
    verifyingKeys?: readonly unknown[];
}

export type MessageExtended = NoExtraProps<{readonly data?: DeepReadonly<RestModel.Message>; readonly verification?: MessageVerification}>;
