import * as DatabaseModel from "src/shared/model/database/index";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";
import {PROVIDER_REPO_MAP} from "src/shared/constants";

/* eslint-disable max-len */

type ExtendByInitializedBooleanProp<T> = {
    [K in keyof T]: T[K] & { initialized?: boolean }
}

type WrapToValueProp<T> = {
    [K in keyof T]: { readonly value: T[K] }
}

interface DefineObservableValue<T, VS extends (arg: unknown) => unknown = (arg: unknown) => unknown> {
    readonly _valueShape: DeepReadonly<VS>;
    readonly value$: import("rxjs").Subject<T>
}

export type ProviderInternalsObservable<T extends ProviderInternals = ProviderInternals> = import("ts-essentials").NonNever<{
    [K in keyof T]:
    T[K] extends DefineObservableValue<infer U> // eslint-disable-line @typescript-eslint/no-unused-vars
        ? T[K]
        : never
}>

export type ProviderInternalsKeys = (typeof PROVIDER_REPO_MAP)["proton-mail"]["protonPack"]["webpackIndexEntryItems"][number]

export type ProviderInternalsLazyKeys = Exclude<Extract<ProviderInternalsKeys,
    | "./node_modules/react-components/hooks/useApi.ts"
    | "./node_modules/react-components/hooks/useAuthentication.ts"
    | "./node_modules/react-components/hooks/useCache.ts"
    | "./node_modules/react-components/hooks/useGetEncryptionPreferences.ts"
    | "./node_modules/react-router/esm/react-router.js"
    | "./src/app/containers/AttachmentProvider.tsx"
    | "./src/app/helpers/attachment/attachmentLoader.ts"
    | "./src/app/hooks/message/useMessageKeys.ts">, never>

export type ProviderInternalsImmediateKeys = Exclude<ProviderInternalsKeys, ProviderInternalsLazyKeys>

// TODO clone the proton project on npm postinstall hook and reference the modules signatures from their typescript code
//      like: typeof import("output/git/proton-mail/node_modules/react-components/containers/app/StandardSetup.tsx")
export type ProviderInternals = ExtendByInitializedBooleanProp<{
    [K in Extract<ProviderInternalsImmediateKeys, "./node_modules/react-components/containers/app/StandardSetup.tsx">]: DefineObservableValue<{
        readonly publicScope: {
            // https://github.com/ProtonMail/react-components/blob/500b9a973ce7347638c11994d809f63299eb5df2/containers/api/ApiProvider.js
            readonly httpApi: HttpApi
            // https://github.com/ProtonMail/proton-shared/blob/bb72d8f979504b1b6ec53b3f010d45e61c2f3ecb/lib/helpers/cache.ts
            readonly authentication: { readonly hasSession?: () => boolean }
            // https://github.com/ProtonMail/react-components/blob/500b9a973ce7347638c11994d809f63299eb5df2/containers/cache/Provider.tsx
            readonly cache: Cache
            // @types/react-router/index.d.ts
            readonly history: ReturnType<typeof import("react-router").useHistory>
        }
    }, (arg: unknown) => import("react").ReactNode>
} & {
    [K in Extract<ProviderInternalsImmediateKeys, "./src/app/containers/PageContainer.tsx">]: DefineObservableValue<{
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
    [K in Extract<ProviderInternalsImmediateKeys, "./src/app/helpers/message/messageDecrypt.ts">]: {
        // https://github.com/ProtonMail/proton-mail/blob/0418b3f3ce98e6fc2c787f9524e9a2cb4a78800c/src/app/helpers/message/messageDecrypt.ts#L99
        readonly decryptMessage: (
            message: RestModel.Message,
            privateKeys: MessageKeys["privateKeys"],
            attachmentsCache: Cache,
        ) => Promise<{ readonly decryptedBody: string }>
    }
} & {
    [K in Extract<ProviderInternalsImmediateKeys, "./node_modules/proton-shared/lib/constants.ts">]: {
        readonly VIEW_MODE: { readonly GROUP: number; readonly SINGLE: number }
    }
} & {
    [K in Extract<ProviderInternalsImmediateKeys, "./node_modules/proton-shared/lib/models/mailSettingsModel.js">]: {
        readonly MailSettingsModel: { readonly key: string }
    }
} & {
    [K in Extract<ProviderInternalsImmediateKeys, "./node_modules/proton-shared/lib/api/labels.ts">]: {
        readonly get: (type?: RestModel.Label["Type"]) => HttpApiArg
    }
} & {
    [K in Extract<ProviderInternalsImmediateKeys, "./node_modules/proton-shared/lib/api/conversations.js">]: {
        readonly getConversation: (id: RestModel.Conversation["ID"]) => HttpApiArg
        readonly queryConversations: (
            params?: RestModel.QueryParams & { LabelID?: Unpacked<RestModel.Conversation["LabelIDs"]> },
        ) => HttpApiArg
    }
} & {
    [K in Extract<ProviderInternalsImmediateKeys, "./node_modules/proton-shared/lib/api/messages.js">]: {
        readonly getMessage: (id: RestModel.Message["ID"]) => HttpApiArg
        readonly queryMessageMetadata: (
            params?: RestModel.QueryParams & { LabelID?: Unpacked<RestModel.Message["LabelIDs"]> },
        ) => HttpApiArg
        readonly markMessageAsRead: (ids: ReadonlyArray<RestModel.Message["ID"]>) => HttpApiArg
        readonly labelMessages: (arg: { LabelID: RestModel.Label["ID"]; IDs: ReadonlyArray<RestModel.Message["ID"]> }) => HttpApiArg
        readonly deleteMessages: (IDs: ReadonlyArray<RestModel.Message["ID"]>) => HttpApiArg
    }
} & {
    [K in Extract<ProviderInternalsImmediateKeys, "./node_modules/proton-shared/lib/api/contacts.ts">]: {
        readonly queryContacts: () => HttpApiArg
        readonly getContact: (id: RestModel.Contact["ID"]) => HttpApiArg
    }
} & {
    [K in Extract<ProviderInternalsImmediateKeys, "./node_modules/proton-shared/lib/api/events.ts">]: {
        readonly getEvents: (id: RestModel.Event["EventID"]) => HttpApiArg
        readonly getLatestID: () => HttpApiArg
    }
} & {
    [K in Extract<ProviderInternalsImmediateKeys, "./src/app/helpers/mailboxUrl.ts">]: {
        readonly setPathInUrl: (
            location: PublicScope["history"]["location"],
            labelID: RestModel.Label["ID"],
            elementID?: RestModel.Conversation["ID"] | RestModel.Message["ID"],
            messageID?: RestModel.Message["ID"],
        ) => Location
    }
}>>

type PublicScope = Unpacked<ProviderInternals["./node_modules/react-components/containers/app/StandardSetup.tsx"]["value$"]>["publicScope"]

type PrivateScope = Exclude<Unpacked<ProviderInternals["./src/app/containers/PageContainer.tsx"]["value$"]>["privateScope"], null>;

export type ProviderInternalsLazy = ExtendByInitializedBooleanProp<{
    [K in Extract<ProviderInternalsLazyKeys, "./node_modules/react-components/hooks/useApi.ts">]: {
        default: () => PublicScope["httpApi"]
    }
} & {
    [K in Extract<ProviderInternalsLazyKeys, "./node_modules/react-components/hooks/useAuthentication.ts">]: {
        default: () => PublicScope["authentication"]
    }
} & {
    [K in Extract<ProviderInternalsLazyKeys, "./node_modules/react-components/hooks/useCache.ts">]: {
        default: () => PublicScope["cache"]
    }
} & {
    [K in Extract<ProviderInternalsLazyKeys, "./node_modules/react-router/esm/react-router.js">]: {
        useHistory: () => PublicScope["history"]
    }
} & {
    [K in Extract<ProviderInternalsLazyKeys, "./node_modules/react-components/hooks/useGetEncryptionPreferences.ts">]: {
        default: () => PrivateScope["getEncryptionPreferences"]
    }
} & {
    [K in Extract<ProviderInternalsLazyKeys, "./src/app/containers/AttachmentProvider.tsx">]: {
        useAttachmentCache: () => PrivateScope["attachmentCache"]
    }
} & {
    [K in Extract<ProviderInternalsLazyKeys, "./src/app/hooks/message/useMessageKeys.ts">]: {
        useMessageKeys: () => PrivateScope["getMessageKeys"]
    }
} & {
    [K in Extract<ProviderInternalsLazyKeys, "./src/app/helpers/attachment/attachmentLoader.ts">]: {
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

export type Cache = { readonly get: <T>(key: string) => T | undefined }

export interface HttpApiArg {
    url?: string
    method?: string
}

export type HttpApi = <T>(arg: HttpApiArg) => Promise<T>

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

export type WebpackJsonpArrayItem = readonly [
    readonly [string | number],
    Record<string, (
        module: unknown,
        __webpack_exports__: Record<string, unknown>,
        __webpack_require__: <T>(moduleKey: string) => T
    ) => void>
]

export type WebpackJsonpPropAwareWindow = typeof window & {
    webpackJsonp?: WebpackJsonpArrayItem[];
}
