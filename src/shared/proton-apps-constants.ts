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
        commit: "61280d0e7156c8e14c786e875f3def4f9f0c198f",
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
        commit: "79f22ed7770aa2e158875f2719b041602807d4ca",
        protonPack: {appConfig: {clientId: "WebAccount"}}
    },
    [PROVIDER_REPO_NAMES[2]]: {
        repoRelativeDistDir: "./dist",
        baseDirName: "contacts",
        repo: "https://github.com/ProtonMail/proton-contacts.git",
        commit: "1c4247de420c612659e33a1a7404b95e732c0baa",
        protonPack: {appConfig: {clientId: "WebContacts"}},
    },
    [PROVIDER_REPO_NAMES[3]]: {
        repoRelativeDistDir: "./dist",
        baseDirName: "calendar",
        repo: "https://github.com/ProtonMail/proton-calendar.git",
        commit: "b1b098072ec5b5f7bf6aee7dbf49b0d4eaa55d43",
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
        commit: "53b5464022a34f8b77ef81c2d965f3b3a7927cde",
        protonPack: {appConfig: {clientId: "WebDrive"}},
    },
} as const;
