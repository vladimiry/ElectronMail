import _logger from "electron-log";
import fs from "fs";
import path from "path";
import {EncryptionAdapter} from "fs-json-store-encryption-adapter";
import {Model as StoreModel} from "fs-json-store";
import {format as formatURL} from "url";
import {nativeTheme} from "electron";
import {randomBytes} from "crypto";

import {Config} from "src/shared/model/options";
import {Context} from "./model";
import {buildInitialVendorsAppCssLinks, curryFunctionMembers, getRandomInt} from "src/shared/util";

const logger = curryFunctionMembers(_logger, __filename);

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
        if (error.code !== "ENOENT") { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
            throw error;
        }
    }

    return configFile
        ? JSON.parse(configFile.toString()) as Config
        : null;
}

export const filterProtonSessionTokenCookies = <T extends { name: string }>(
    items: readonly T[],
): { readonly accessTokens: typeof items; readonly refreshTokens: typeof items } => {
    return {
        accessTokens: items.filter(({name}) => name.toUpperCase().startsWith("AUTH-")),
        refreshTokens: items.filter(({name}) => name.toUpperCase().startsWith("REFRESH-")),
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
