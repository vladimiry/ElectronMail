import {AddInitializedProp, DefineObservableValue, WrapToValueProp} from "src/electron-preload/webview/lib/provider-api/model";
import * as DatabaseModel from "src/shared/model/database/index";
import {HttpApi, HttpApiArg} from "src/electron-preload/webview/lib/provider-api/standart-setup-internals/model";
import {PROVIDER_REPO_MAP, PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS} from "src/shared/const/proton-apps";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";

/* eslint-disable max-len */

export type Keys = StrictExclude<(typeof PROVIDER_REPO_MAP)["proton-mail"]["protonPack"]["webpackIndexEntryItems"][number],
    typeof PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS[number]>

export type LazyKeys = StrictExclude<StrictExtract<Keys,
    | "../../packages/components/hooks/useGetEncryptionPreferences.ts"
    | "./src/app/helpers/attachment/attachmentLoader.ts"
    | "./src/app/hooks/message/useGetMessageKeys.ts">, never>

export type ImmediateKeys = StrictExclude<Keys, LazyKeys>

// TODO clone the proton project on npm postinstall hook and reference the modules signatures from their typescript code
//      like: typeof import("output/git/proton-mail/src/app/containers/PageContainer.tsx")
export type ProviderInternals = AddInitializedProp<{
    [K in StrictExtract<ImmediateKeys, "./src/app/containers/PageContainer.tsx">]: DefineObservableValue<{
        readonly privateScope: null | {
            // https://github.com/ProtonMail/WebClients/blob/3768deb904dd7865487fb71cb1bcee328cf32c30/packages/shared/lib/interfaces/hooks/GetEncryptionPreferences.ts
            readonly getEncryptionPreferences: (
                attr: {
                    email: RestModel.Message["Sender"]["Address"]
                    intendedForEmail?: boolean;
                    lifetime?: number;
                    contactEmailsMap?: { [email: string]: RestModel.ContactEmail | undefined };
                }
            ) => Promise<EncryptionPreferences>
            // https://github.com/ProtonMail/proton-mail/blob/77b133013cdb5695aa23c0c4c29cc6578878faa5/src/app/hooks/message/useGetMessageKeys.ts#L13
            readonly getMessageKeys: (message: Pick<RestModel.Message, "AddressID">) => Promise<MessageKeys>
            // https://github.com/ProtonMail/proton-mail/blob/77b133013cdb5695aa23c0c4c29cc6578878faa5/src/app/helpers/attachment/attachmentLoader.ts#L46
            readonly getDecryptedAttachment: (
                attachment: RestModel.Attachment,
                verification: MessageExtended["verification"] | undefined,
                messageKeys: MessageKeys,
                api: HttpApi,
            ) => Promise<{ data: Uint8Array }>
        }
    }, (arg: unknown) => import("react").ReactNode>
} & WrapToValueProp<{
    [K in StrictExtract<ImmediateKeys, "./src/app/helpers/message/messageDecrypt.ts">]: {
        // https://github.com/ProtonMail/WebClients/blob/03822ade27ff3cbaa7549492232f290cb14924e8/applications/mail/src/app/helpers/message/messageDecrypt.ts#L167
        readonly decryptMessage: (
            message: RestModel.Message,
            privateKeys: MessageKeys["privateKeys"],
            // getAttachment?: (ID: string) => DecryptResultPmcrypto | undefined,
            // onUpdateAttachment?: (ID: string, attachment: DecryptResultPmcrypto) => void,
            // password?: string
        ) => Promise<Readonly<{
            decryptedBody: string;
            // decryptedRawContent: Uint8Array;
            // attachments?: Attachment[];
            decryptedSubject?: string;
            // signature?: OpenPGPSignature;
            errors?: unknown;
            // mimetype?: MIME_TYPES;
        }>>
    }
} & {
    [K in StrictExtract<ImmediateKeys, "../../packages/shared/lib/mail/mailSettings.ts">]: {
        readonly VIEW_MODE: { readonly GROUP: number; readonly SINGLE: number }
    }
} & {
    [K in StrictExtract<ImmediateKeys, "../../packages/shared/lib/models/mailSettingsModel.js">]: {
        readonly MailSettingsModel: { readonly key: string }
    }
} & {
    [K in StrictExtract<ImmediateKeys, "../../packages/shared/lib/api/labels.ts">]: {
        readonly get: (type?: RestModel.Label["Type"]) => HttpApiArg
    }
} & {
    [K in StrictExtract<ImmediateKeys, "../../packages/shared/lib/api/messages.ts">]: {
        readonly queryMessageCount: () => HttpApiArg
        readonly getMessage: (id: RestModel.Message["ID"]) => HttpApiArg
        readonly queryMessageMetadata: (
            params?: RestModel.QueryParams & { LabelID?: Unpacked<RestModel.Message["LabelIDs"]> },
        ) => HttpApiArg
        readonly markMessageAsRead: (ids: ReadonlyArray<RestModel.Message["ID"]>) => HttpApiArg
        readonly labelMessages: (arg: { LabelID: RestModel.Label["ID"]; IDs: ReadonlyArray<RestModel.Message["ID"]> }) => HttpApiArg
        readonly deleteMessages: (IDs: ReadonlyArray<RestModel.Message["ID"]>) => HttpApiArg
    }
} & {
    [K in StrictExtract<ImmediateKeys, "../../packages/shared/lib/api/contacts.ts">]: {
        readonly queryContacts: () => HttpApiArg
        readonly getContact: (id: RestModel.Contact["ID"]) => HttpApiArg
    }
} & {
    [K in StrictExtract<ImmediateKeys, "../../packages/shared/lib/api/events.ts">]: {
        readonly getEvents: (id: RestModel.Event["EventID"]) => HttpApiArg
        readonly getLatestID: () => HttpApiArg
    }
} & {
    [K in StrictExtract<ImmediateKeys, "./src/app/helpers/mailboxUrl.ts">]: {
        readonly setParamsInLocation: (
            location: ReturnType<typeof import("react-router").useHistory>["location"],
            params: {
                labelID: RestModel.Label["ID"],
                // eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
                elementID?: RestModel.Conversation["ID"] | RestModel.Message["ID"],
                messageID?: RestModel.Message["ID"],
            },
        ) => Location
    }
}>>

type PrivateScope = StrictExclude<Unpacked<ProviderInternals["./src/app/containers/PageContainer.tsx"]["value$"]>["privateScope"], null>;

export type ProviderInternalsLazy = AddInitializedProp<{
    [K in StrictExtract<LazyKeys, "../../packages/components/hooks/useGetEncryptionPreferences.ts">]: {
        default: () => PrivateScope["getEncryptionPreferences"]
    }
} & {
    [K in StrictExtract<LazyKeys, "./src/app/hooks/message/useGetMessageKeys.ts">]: {
        useGetMessageKeys: () => PrivateScope["getMessageKeys"]
    }
} & {
    [K in StrictExtract<LazyKeys, "./src/app/helpers/attachment/attachmentLoader.ts">]: {
        getDecryptedAttachment: PrivateScope["getDecryptedAttachment"]
    }
}>

export type ProviderApi = { _throwErrorOnRateLimitedMethodCall?: boolean } & Readonly<{
    _custom_: Readonly<{
        loggedIn$: import("rxjs").Observable<boolean>
        cachedMailSettingsModel$: import("rxjs").Observable<{ readonly ViewMode: number }>
        buildEventsApiUrlTester: (options: { entryApiUrl: string }) => (url: string) => boolean
        buildMessagesCountApiUrlTester: (options: { entryApiUrl: string }) => (url: string) => boolean
        decryptMessage: (message: RestModel.Message) => Promise<{ decryptedSubject?: string, decryptedBody: string }>
    }>
    constants: ProviderInternals["../../packages/shared/lib/mail/mailSettings.ts"]["value"],
    label: Readonly<{
        get: (
            ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/labels.ts"]["value"]["get"]>
        ) => Promise<RestModel.LabelsResponse>
    }>,
    message: Readonly<{
        queryMessageCount: (
            ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/messages.ts"]["value"]["queryMessageCount"]>
        ) => Promise<RestModel.MessagesCountResponse>
        getMessage: (
            ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/messages.ts"]["value"]["getMessage"]>
        ) => Promise<RestModel.MessageResponse>
        queryMessageMetadata: (
            ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/messages.ts"]["value"]["queryMessageMetadata"]>
        ) => Promise<RestModel.MessagesResponse>
        markMessageAsRead: (
            ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/messages.ts"]["value"]["markMessageAsRead"]>
        ) => Promise<void>
        labelMessages: (
            ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/messages.ts"]["value"]["labelMessages"]>
        ) => Promise<void>
        deleteMessages: (
            ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/messages.ts"]["value"]["deleteMessages"]>
        ) => Promise<void>
    }>,
    contact: Readonly<{
        queryContacts: (
            ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/contacts.ts"]["value"]["queryContacts"]>
        ) => Promise<RestModel.ContactsResponse>
        getContact: (
            ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/contacts.ts"]["value"]["getContact"]>
        ) => Promise<RestModel.ContactResponse>
    }>,
    events: Readonly<{
        getEvents: (
            ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/events.ts"]["value"]["getEvents"]>
        ) => Promise<RestModel.EventResponse>
        getLatestID: (
            ...args: Parameters<ProviderInternals["../../packages/shared/lib/api/events.ts"]["value"]["getLatestID"]>
        ) => Promise<RestModel.LatestEventResponse>
    }>,
    attachmentLoader: Readonly<{
        getDecryptedAttachment: (
            attachment: RestModel.Attachment,
            message: RestModel.Message,
        ) => Promise<NoExtraProps<{ data: Uint8Array }>>
    }>,
    history: Readonly<{
        push: (
            options: {
                // eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
                conversationId?: DatabaseModel.ConversationEntry["id"] | DatabaseModel.Mail["id"]
                mailId?: DatabaseModel.Mail["id"]
                folderId: DatabaseModel.Folder["id"]
            }
        ) => Promise<void>
    }>,
}>;

export interface EncryptionPreferences {
    readonly pinnedKeys: readonly unknown[]
    readonly isContactSignatureVerified?: boolean;
}

export interface MessageKeys {
    readonly publicKeys: readonly unknown[]
    readonly privateKeys: readonly unknown[]
}

export interface MessageVerification {
    senderPinnedKeys: EncryptionPreferences["pinnedKeys"] | undefined;
    pinnedKeysVerified: boolean | undefined;
}

export type MessageExtended = NoExtraProps<{
    readonly data?: DeepReadonly<RestModel.Message>
    readonly verification?: MessageVerification
}>;
