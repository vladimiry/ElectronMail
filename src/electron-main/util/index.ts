import _logger from "electron-log";
import {EncryptionAdapter} from "fs-json-store-encryption-adapter";
import {format as formatURL} from "url";
import fs from "fs";
import {nativeTheme, session as electronSession, Session} from "electron";
import path from "path";
import {randomBytes} from "crypto";
import {Model as StoreModel} from "fs-json-store";

import {AccountConfig} from "src/shared/model/account";
import {buildInitialVendorsAppCssLinks, curryFunctionMembers, getRandomInt} from "src/shared/util";
import {Config} from "src/shared/model/options";
import {Context} from "src/electron-main/model";
import {createSessionUtil} from "src/electron-main/session";
import {PACKAGE_NAME} from "src/shared/const";
import {PROTON_API_ENTRY_URLS} from "src/shared/const/proton-url";

const logger = curryFunctionMembers(_logger, __filename);

type resolveDefaultAppSessionType = () => Session;

export const resolveDefaultAppSession: resolveDefaultAppSessionType = (() => {
    let session: Session | undefined;
    const result: resolveDefaultAppSessionType = () => {
        return session ??= createSessionUtil.create("partition/default-app-session");
    };
    return result;
})();

export function formatFileUrl(pathname: string): string {
    return formatURL({pathname, protocol: "file:", slashes: true});
}

export async function injectVendorsAppCssIntoHtmlFile(
    pageLocation: string,
    {vendorsAppCssLinkHrefs}: Context["locations"],
): Promise<{ html: string; baseURLForDataURL: string }> {
    const pageContent = fs.readFileSync(pageLocation).toString();
    const baseURLForDataURL = formatFileUrl(`${path.dirname(pageLocation)}${path.sep}`);
    const htmlInjection = buildInitialVendorsAppCssLinks(vendorsAppCssLinkHrefs, nativeTheme.shouldUseDarkColors);
    const html = pageContent.replace(/(.*)(<head>)(.*)/i, `$1$2${htmlInjection}$3`);

    if (!html.includes(htmlInjection)) {
        logger.error(nameof(injectVendorsAppCssIntoHtmlFile), JSON.stringify({html}));
        throw new Error(`Failed to inject "${htmlInjection}" into the "${pageLocation}" page`);
    }

    return {html, baseURLForDataURL};
}

export async function buildSettingsAdapter(
    {configStore}: Context,
    password: string,
): Promise<StoreModel.StoreAdapter> {
    return new EncryptionAdapter(
        {password, preset: (await configStore.readExisting()).encryptionPreset},
        {keyDerivationCache: true, keyDerivationCacheLimit: 3},
    );
}

export function hrtimeDuration(): { end: () => number } {
    const start = process.hrtime();

    return {
        end(): number {
            const time = process.hrtime(start);

            return Math.round((time[0] * 1000) + (time[1] / 1000000));
        },
    };
}

// TODO add synchronous "read" method to "fs-json-store"
// returning "deep partialed" result since sync reading normally runs before the storages get updated
export function readConfigSync({configStore}: DeepReadonly<Context>): import("ts-essentials").DeepPartial<Config> | null {
    let configFile: Buffer | string | undefined;

    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        configFile = configStore.fs._impl.readFileSync(configStore.file); // eslint-disable-line @typescript-eslint/no-unsafe-call
    } catch (error) {
        if ((Object(error) as { code?: unknown }).code !== "ENOENT") {
            throw error;
        }
    }

    return configFile
        ? JSON.parse(configFile.toString()) as Config
        : null;
}

export const filterProtonSessionApplyingCookies = <T extends { name: string }>(items: readonly T[]): {
    readonly accessTokens: typeof items
    readonly refreshTokens: typeof items
    readonly sessionIds: typeof items
} => {
    return {
        accessTokens: items.filter(({name}) => name.toUpperCase().startsWith("AUTH-")),
        refreshTokens: items.filter(({name}) => name.toUpperCase().startsWith("REFRESH-")),
        sessionIds: items.filter(({name}) => name.toUpperCase() === "SESSION-ID"),
    } as const;
};

export const generateDataSaltBase64 = (minBytes: number, maxBytes: number): string => {
    const size = getRandomInt(minBytes, maxBytes);
    return randomBytes(size).toString("base64");
};

export const resolveUiContextStrict = async (ctx: Context): Promise<Exclude<Context["uiContext"], undefined>> => {
    const {uiContext} = ctx;
    if (!uiContext) {
        throw new Error(`"${nameof(uiContext)}" has not been initialized`);
    }
    return uiContext;
};

export const getPurifiedUserAgent = (userAgent: string): string => {
    const appNameRe = new RegExp(`${PACKAGE_NAME}[\\/\\S]+`, "i");
    const electronRe = new RegExp("electron", "i");
    return userAgent
        .split(appNameRe)
        .join("")
        .split(/\s+/)
        .filter((chunk) => !electronRe.exec(chunk))
        .join(" ");
};

export const getUserAgentByAccount = ({customUserAgent}: Pick<AccountConfig, "customUserAgent">): string => {
    return customUserAgent || getPurifiedUserAgent(electronSession.defaultSession.getUserAgent());
};

export const assertEntryUrl = (value: string): void | never => {
    if (!PROTON_API_ENTRY_URLS.includes(value)) {
        throw new Error(`Invalid API entry point value: ${value}`);
    }
};
