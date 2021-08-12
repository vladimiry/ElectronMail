export const PROVIDER_APP_NAMES = [
    "proton-mail",
    "proton-account",
    "proton-calendar",
    "proton-drive",
] as const;

export const PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS = [
    // immediate
    "../../packages/components/containers/app/StandardSetup.tsx",
    // lazy/dynamic
    // triggered via "../../packages/components/containers/app/StandardSetup.tsx":
    "../../packages/components/hooks/useApi.ts",
    "../../packages/components/hooks/useAuthentication.ts",
    "../../packages/components/hooks/useCache.ts",
    "../../node_modules/react-router/esm/react-router.js",
] as const;

export const PROVIDER_REPO_MAP = {
    [PROVIDER_APP_NAMES[0]]: {
        repoRelativeDistDir: "./dist",
        baseDirName: "",
        tag: "proton-mail@4.3.7",
        protonPack: {
            appConfig: {clientId: "WebMail"},
            webpackIndexEntryItems: [
                // immediate
                "../../packages/shared/lib/api/contacts.ts",
                "../../packages/shared/lib/api/conversations.js",
                "../../packages/shared/lib/api/events.ts",
                "../../packages/shared/lib/api/labels.ts",
                "../../packages/shared/lib/api/messages.js",
                "../../packages/shared/lib/constants.ts",
                "../../packages/shared/lib/models/mailSettingsModel.js",
                "./src/app/containers/PageContainer.tsx",
                "./src/app/helpers/mailboxUrl.ts",
                "./src/app/helpers/message/messageDecrypt.ts",
                // lazy/dynamic
                // triggered via "./src/app/containers/PageContainer.tsx":
                "../../packages/components/hooks/useGetEncryptionPreferences.ts",
                "./src/app/containers/AttachmentProvider.tsx",
                "./src/app/helpers/attachment/attachmentLoader.ts",
                "./src/app/hooks/message/useGetMessageKeys.ts",
                ...PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS,
            ],
        },
    },
    [PROVIDER_APP_NAMES[1]]: {
        repoRelativeDistDir: "./dist",
        baseDirName: "account",
        tag: "proton-account@4.4.0",
        protonPack: {appConfig: {clientId: "WebAccount"}}
    },
    [PROVIDER_APP_NAMES[2]]: {
        repoRelativeDistDir: "./dist",
        baseDirName: "calendar",
        tag: "proton-calendar@4.3.4",
        protonPack: {
            appConfig: {clientId: "WebCalendar"},
            webpackIndexEntryItems: [
                // immediate
                "./src/app/content/PrivateApp.tsx",
                ...PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS,
            ],
        },
    },
    [PROVIDER_APP_NAMES[3]]: {
        repoRelativeDistDir: "./dist",
        baseDirName: "drive",
        tag: "proton-drive@4.3.1",
        protonPack: {appConfig: {clientId: "WebDrive"}},
    },
} as const;

export const PROTON_SHARED_MESSAGE_INTERFACE = {
    projectRelativeFile: "./lib/interfaces/mail/Message.ts",
    url: "",
} as const;
