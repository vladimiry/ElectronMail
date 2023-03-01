export const PROVIDER_APP_NAMES = [
    "proton-mail",
    "proton-account",
    "proton-calendar",
    "proton-drive",
    "proton-vpn-settings",
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

// using "<app-type>-api"-like subdomain as discussed in https://github.com/ProtonMail/WebClients/issues/276
export const PROVIDER_REPO_MAP = {
    [PROVIDER_APP_NAMES[0]]: {
        basePath: "",
        apiSubdomain: "mail-api",
        repoRelativeDistDir: "./dist",
        tag: "proton-mail@5.0.17.12",
        protonPack: {
            webpackIndexEntryItems: [
                // immediate
                "../../packages/shared/lib/api/contacts.ts",
                "../../packages/shared/lib/api/events.ts",
                "../../packages/shared/lib/api/labels.ts",
                "../../packages/shared/lib/api/messages.ts",
                "../../packages/shared/lib/constants.ts",
                "../../packages/shared/lib/models/mailSettingsModel.js",
                "./src/app/containers/PageContainer.tsx",
                "./src/app/helpers/mailboxUrl.ts",
                "./src/app/helpers/message/messageDecrypt.ts",
                // lazy/dynamic
                // triggered via "./src/app/containers/PageContainer.tsx":
                "../../packages/components/hooks/useGetEncryptionPreferences.ts",
                "./src/app/helpers/attachment/attachmentLoader.ts",
                "./src/app/hooks/message/useGetMessageKeys.ts",
                ...PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS,
            ],
        },
    },
    [PROVIDER_APP_NAMES[1]]: {
        basePath: "account",
        apiSubdomain: "account-api",
        repoRelativeDistDir: "./dist",
        tag: "proton-account@5.0.18.4",
        protonPack: {}
    },
    [PROVIDER_APP_NAMES[2]]: {
        basePath: "calendar",
        apiSubdomain: "calendar-api",
        repoRelativeDistDir: "./dist",
        tag: "proton-calendar@5.0.8.1",
        protonPack: {
            webpackIndexEntryItems: [
                // immediate
                "./src/app/content/PrivateApp.tsx",
                ...PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS,
            ],
        },
    },
    [PROVIDER_APP_NAMES[3]]: {
        basePath: "drive",
        apiSubdomain: "drive-api",
        repoRelativeDistDir: "./dist",
        tag: "proton-drive@5.0.11.1",
        protonPack: {},
    },
    [PROVIDER_APP_NAMES[4]]: {
        basePath: "account/vpn",
        apiSubdomain: "account-api",
        repoRelativeDistDir: "./dist",
        tag: "proton-vpn-settings@5.0.15.1",
        protonPack: {},
    },
} as const;

export const PROTON_SHARED_MESSAGE_INTERFACE = {
    projectRelativeFile: "./lib/interfaces/mail/Message.ts",
    url: "",
} as const;
