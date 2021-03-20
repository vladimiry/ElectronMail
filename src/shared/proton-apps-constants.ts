export const PROVIDER_REPO_NAMES = [
    "proton-mail",
    "proton-account",
    "proton-contacts",
    "proton-calendar",
    "proton-drive",
] as const;

export const PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS = [
    // immediate
    "./node_modules/react-components/containers/app/StandardSetup.tsx",
    // lazy/dynamic
    // triggered via "./node_modules/react-components/containers/app/StandardSetup.tsx":
    "./node_modules/react-components/hooks/useApi.ts",
    "./node_modules/react-components/hooks/useAuthentication.ts",
    "./node_modules/react-components/hooks/useCache.ts",
    "./node_modules/react-router/esm/react-router.js",
] as const;

export const PROVIDER_REPO_MAP = {
    [PROVIDER_REPO_NAMES[0]]: {
        repoRelativeDistDir: "./dist",
        baseDirName: "",
        repo: "https://github.com/ProtonMail/proton-mail.git",
        commit: "b2f687027ca992533dfc87570b2bc8c1852b9ca9",
        protonPack: {
            appConfig: {clientId: "WebMail"},
            webpackIndexEntryItems: [
                // immediate
                "./node_modules/proton-shared/lib/api/contacts.ts",
                "./node_modules/proton-shared/lib/api/conversations.js",
                "./node_modules/proton-shared/lib/api/events.ts",
                "./node_modules/proton-shared/lib/api/labels.ts",
                "./node_modules/proton-shared/lib/api/messages.js",
                "./node_modules/proton-shared/lib/constants.ts",
                "./node_modules/proton-shared/lib/models/mailSettingsModel.js",
                "./src/app/containers/PageContainer.tsx",
                "./src/app/helpers/mailboxUrl.ts",
                "./src/app/helpers/message/messageDecrypt.ts",
                // lazy/dynamic
                // triggered via "./src/app/containers/PageContainer.tsx":
                "./node_modules/react-components/hooks/useGetEncryptionPreferences.ts",
                "./src/app/containers/AttachmentProvider.tsx",
                "./src/app/helpers/attachment/attachmentLoader.ts",
                "./src/app/hooks/message/useGetMessageKeys.ts",
                ...PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS,
            ],
        },
    },
    [PROVIDER_REPO_NAMES[1]]: {
        repoRelativeDistDir: "./dist",
        baseDirName: "account",
        repo: "https://github.com/ProtonMail/proton-account.git",
        commit: "2e834bda81f744b493740c4dd6212aa90a33e9b5",
        protonPack: {appConfig: {clientId: "WebAccount"}}
    },
    [PROVIDER_REPO_NAMES[2]]: {
        repoRelativeDistDir: "./dist",
        baseDirName: "contacts",
        repo: "https://github.com/ProtonMail/proton-contacts.git",
        commit: "f3f0f98621517c7e7dece9e0b6b7e02340d35cc7",
        protonPack: {appConfig: {clientId: "WebContacts"}},
    },
    [PROVIDER_REPO_NAMES[3]]: {
        repoRelativeDistDir: "./dist",
        baseDirName: "calendar",
        repo: "https://github.com/ProtonMail/proton-calendar.git",
        commit: "f01961c7afbafb292d07380af13125c593d98ac3",
        protonPack: {
            appConfig: {clientId: "WebCalendar"},
            webpackIndexEntryItems: [
                // immediate
                "./src/app/content/PrivateApp.tsx",
                ...PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS,
            ],
        },
    },
    [PROVIDER_REPO_NAMES[4]]: {
        repoRelativeDistDir: "./dist",
        baseDirName: "drive",
        repo: "https://github.com/ProtonMail/proton-drive.git",
        commit: "349a7d834242b3319ec8566f746bdbca83efc976",
        protonPack: {appConfig: {clientId: "WebDrive"}},
    },
} as const;

export const PROTON_SHARED_MESSAGE_INTERFACE = {
    projectRelativeFile: "./lib/interfaces/mail/Message.ts",
    url: "",
} as const;
