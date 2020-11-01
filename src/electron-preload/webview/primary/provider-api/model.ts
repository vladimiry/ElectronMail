import * as DatabaseModel from "src/shared/model/database/index";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";
import {
    AddInitializedProp,
    DefineObservableValue,
    WrapToValueProp
} from "src/electron-preload/webview/lib/provider-api/model";
import {Cache, HttpApi, HttpApiArg} from "src/electron-preload/webview/lib/provider-api/standart-setup-internals/model";
import {PROVIDER_REPO_MAP, PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS} from "src/shared/constants";

/* eslint-disable max-len */

export type Keys = StrictExclude<(typeof PROVIDER_REPO_MAP)["proton-mail"]["protonPack"]["webpackIndexEntryItems"][number],
    typeof PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS[number]>

export type LazyKeys = StrictExclude<StrictExtract<Keys,
    | "./node_modules/react-components/hooks/useGetEncryptionPreferences.ts"
    | "./src/app/containers/AttachmentProvider.tsx"
    | "./src/app/helpers/attachment/attachmentLoader.ts"
    | "./src/app/hooks/message/useMessageKeys.ts">, never>

export type ImmediateKeys = StrictExclude<Keys, LazyKeys>

// TODO clone the proton project on npm postinstall hook and reference the modules signatures from their typescript code
//      like: typeof import("output/git/proton-mail/src/app/containers/PageContainer.tsx")
export type ProviderInternals = AddInitializedProp<{
    [K in StrictExtract<ImmediateKeys, "./src/app/containers/PageContainer.tsx">]: DefineObservableValue<{
        readonly privateScope: null | {
            // https://github.com/ProtonMail/react-components/blob/276aeddfba47dd473e96a54dbd2b12d6214a6359/hooks/useGetEncryptionPreferences.ts
            readonly getEncryptionPreferences: (senderAddress: RestModel.Message["Sender"]["Address"]) => Promise<EncryptionPreferences>
            // https://github.com/ProtonMail/proton-mail/blob/7f0116a096ca6a00369f18b0c62fa79a48e4e62e/src/app/containers/AttachmentProvider.tsx
            readonly attachmentCache: Cache
            // https://github.com/ProtonMail/proton-mail/blob/7f0116a096ca6a00369f18b0c62fa79a48e4e62e/src/app/hooks/message/useMessageKeys.ts
            readonly getMessageKeys: (message: MessageExtendedWithData) => Promise<MessageKeys>
            // https://github.com/ProtonMail/proton-mail/blob/2ab916e847bfe8064f5ff321c50f1028adf547e1/src/app/helpers/attachment/attachmentLoader.ts
            readonly getDecryptedAttachment: (
                attachment: RestModel.Attachment,
                message: NoExtraProps<Pick<Required<MessageExtended>,
                    // only actually accessed props get listed here
                    | "senderPinnedKeys"
                    | "senderVerified"
                    | "privateKeys">>,
                api: HttpApi
            ) => Promise<{ data: Uint8Array }>
        }
    }, (arg: unknown) => import("react").ReactNode>
} & WrapToValueProp<{
    [K in StrictExtract<ImmediateKeys, "./src/app/helpers/message/messageDecrypt.ts">]: {
        // https://github.com/ProtonMail/proton-mail/blob/0418b3f3ce98e6fc2c787f9524e9a2cb4a78800c/src/app/helpers/message/messageDecrypt.ts#L99
        readonly decryptMessage: (
            message: RestModel.Message,
            privateKeys: MessageKeys["privateKeys"],
            attachmentsCache: Cache,
        ) => Promise<{ readonly decryptedBody: string }>
    }
} & {
    [K in StrictExtract<ImmediateKeys, "./node_modules/proton-shared/lib/constants.ts">]: {
        readonly VIEW_MODE: { readonly GROUP: number; readonly SINGLE: number }
    }
} & {
    [K in StrictExtract<ImmediateKeys, "./node_modules/proton-shared/lib/models/mailSettingsModel.js">]: {
        readonly MailSettingsModel: { readonly key: string }
    }
} & {
    [K in StrictExtract<ImmediateKeys, "./node_modules/proton-shared/lib/api/labels.ts">]: {
        readonly get: (type?: RestModel.Label["Type"]) => HttpApiArg
    }
} & {
    [K in StrictExtract<ImmediateKeys, "./node_modules/proton-shared/lib/api/conversations.js">]: {
        readonly getConversation: (id: RestModel.Conversation["ID"]) => HttpApiArg
        readonly queryConversations: (
            params?: RestModel.QueryParams & { LabelID?: Unpacked<RestModel.Conversation["LabelIDs"]> },
        ) => HttpApiArg
    }
} & {
    [K in StrictExtract<ImmediateKeys, "./node_modules/proton-shared/lib/api/messages.js">]: {
        readonly getMessage: (id: RestModel.Message["ID"]) => HttpApiArg
        readonly queryMessageMetadata: (
            params?: RestModel.QueryParams & { LabelID?: Unpacked<RestModel.Message["LabelIDs"]> },
        ) => HttpApiArg
        readonly markMessageAsRead: (ids: ReadonlyArray<RestModel.Message["ID"]>) => HttpApiArg
        readonly labelMessages: (arg: { LabelID: RestModel.Label["ID"]; IDs: ReadonlyArray<RestModel.Message["ID"]> }) => HttpApiArg
        readonly deleteMessages: (IDs: ReadonlyArray<RestModel.Message["ID"]>) => HttpApiArg
    }
} & {
    [K in StrictExtract<ImmediateKeys, "./node_modules/proton-shared/lib/api/contacts.ts">]: {
        readonly queryContacts: () => HttpApiArg
        readonly getContact: (id: RestModel.Contact["ID"]) => HttpApiArg
    }
} & {
    [K in StrictExtract<ImmediateKeys, "./node_modules/proton-shared/lib/api/events.ts">]: {
        readonly getEvents: (id: RestModel.Event["EventID"]) => HttpApiArg
        readonly getLatestID: () => HttpApiArg
    }
} & {
    [K in StrictExtract<ImmediateKeys, "./src/app/helpers/mailboxUrl.ts">]: {
        readonly setPathInUrl: (
            location: ReturnType<typeof import("react-router").useHistory>["location"],
            labelID: RestModel.Label["ID"],
            elementID?: RestModel.Conversation["ID"] | RestModel.Message["ID"],
            messageID?: RestModel.Message["ID"],
        ) => Location
    }
}>>

type PrivateScope = StrictExclude<Unpacked<ProviderInternals["./src/app/containers/PageContainer.tsx"]["value$"]>["privateScope"], null>;

export type ProviderInternalsLazy = AddInitializedProp<{
    [K in StrictExtract<LazyKeys, "./node_modules/react-components/hooks/useGetEncryptionPreferences.ts">]: {
        default: () => PrivateScope["getEncryptionPreferences"]
    }
} & {
    [K in StrictExtract<LazyKeys, "./src/app/containers/AttachmentProvider.tsx">]: {
        useAttachmentCache: () => PrivateScope["attachmentCache"]
    }
} & {
    [K in StrictExtract<LazyKeys, "./src/app/hooks/message/useMessageKeys.ts">]: {
        useMessageKeys: () => PrivateScope["getMessageKeys"]
    }
} & {
    [K in StrictExtract<LazyKeys, "./src/app/helpers/attachment/attachmentLoader.ts">]: {
        getDecryptedAttachment: PrivateScope["getDecryptedAttachment"]
    }
}>

export type ProviderApi = DeepReadonly<{
    _custom_: {
        loggedIn$: import("rxjs").Observable<boolean>
        cachedMailSettingsModel$: import("rxjs").Observable<{ readonly ViewMode: number }>
        buildEventsApiUrlTester: (options: { entryApiUrl: string }) => (url: string) => boolean
        buildMessagesCountApiUrlTester: (options: { entryApiUrl: string }) => (url: string) => boolean
        decryptMessageBody: (message: RestModel.Message) => Promise<string>
    }
    constants: ProviderInternals["./node_modules/proton-shared/lib/constants.ts"]["value"],
    label: {
        get: (
            ...args: Parameters<ProviderInternals["./node_modules/proton-shared/lib/api/labels.ts"]["value"]["get"]>
        ) => Promise<RestModel.LabelsResponse>
    },
    conversation: {
        getConversation: (
            ...args: Parameters<ProviderInternals["./node_modules/proton-shared/lib/api/conversations.js"]["value"]["getConversation"]>
        ) => Promise<RestModel.ConversationResponse>
        queryConversations: (
            ...args: Parameters<ProviderInternals["./node_modules/proton-shared/lib/api/conversations.js"]["value"]["queryConversations"]>
        ) => Promise<RestModel.ConversationsResponse>
    },
    message: {
        getMessage: (
            ...args: Parameters<ProviderInternals["./node_modules/proton-shared/lib/api/messages.js"]["value"]["getMessage"]>
        ) => Promise<RestModel.MessageResponse>
        queryMessageMetadata: (
            ...args: Parameters<ProviderInternals["./node_modules/proton-shared/lib/api/messages.js"]["value"]["queryMessageMetadata"]>
        ) => Promise<RestModel.MessagesResponse>
        markMessageAsRead: (
            ...args: Parameters<ProviderInternals["./node_modules/proton-shared/lib/api/messages.js"]["value"]["markMessageAsRead"]>
        ) => Promise<void>
        labelMessages: (
            ...args: Parameters<ProviderInternals["./node_modules/proton-shared/lib/api/messages.js"]["value"]["labelMessages"]>
        ) => Promise<void>
        deleteMessages: (
            ...args: Parameters<ProviderInternals["./node_modules/proton-shared/lib/api/messages.js"]["value"]["deleteMessages"]>
        ) => Promise<void>
    },
    contact: {
        queryContacts: (
            ...args: Parameters<ProviderInternals["./node_modules/proton-shared/lib/api/contacts.ts"]["value"]["queryContacts"]>
        ) => Promise<RestModel.ContactsResponse>
        getContact: (
            ...args: Parameters<ProviderInternals["./node_modules/proton-shared/lib/api/contacts.ts"]["value"]["getContact"]>
        ) => Promise<RestModel.ContactResponse>
    },
    events: {
        getEvents: (
            ...args: Parameters<ProviderInternals["./node_modules/proton-shared/lib/api/events.ts"]["value"]["getEvents"]>
        ) => Promise<RestModel.EventResponse>
        getLatestID: (
            ...args: Parameters<ProviderInternals["./node_modules/proton-shared/lib/api/events.ts"]["value"]["getLatestID"]>
        ) => Promise<RestModel.LatestEventResponse>
    },
    attachmentLoader: {
        getDecryptedAttachment: (
            attachment: RestModel.Attachment,
            message: RestModel.Message,
        ) => Promise<NoExtraProps<{ data: Uint8Array }>>
    },
    history: {
        push: (
            options: {
                conversationId?: DatabaseModel.ConversationEntry["id"] | DatabaseModel.Mail["id"]
                mailId?: DatabaseModel.Mail["id"]
                folderId: DatabaseModel.Folder["id"]
            }
        ) => Promise<void>
    },
}>

export interface EncryptionPreferences {
    readonly pinnedKeys: readonly unknown[]
    readonly isContactSignatureVerified?: boolean;
}

export interface MessageKeys {
    readonly publicKeys: readonly unknown[]
    readonly privateKeys: readonly unknown[]
}

export type MessageExtended = NoExtraProps<{
    readonly data?: DeepReadonly<RestModel.Message>
    readonly senderPinnedKeys?: EncryptionPreferences["pinnedKeys"]
    readonly senderVerified?: EncryptionPreferences["isContactSignatureVerified"]
    readonly privateKeys?: MessageKeys["privateKeys"]
}>;

export type MessageExtendedWithData = NoExtraProps<Required<Pick<MessageExtended, "data">> & MessageExtended>;
