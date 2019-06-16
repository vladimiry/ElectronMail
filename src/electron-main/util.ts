import _logger from "electron-log";
import fs from "fs";
import path from "path";
import url from "url";
import {EncryptionAdapter} from "fs-json-store-encryption-adapter";
import {Model as StoreModel} from "fs-json-store";

import {Context} from "./model";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[src/electron-main/util]");
const cache: { vendorsAppCssLinkHref?: ReturnType<typeof resolveVendorsAppCssLinkHref> } = {};

export function resolveVendorsAppCssLinkHref({appDir}: Pick<Context["locations"], "appDir">): string {
    if (cache.vendorsAppCssLinkHref) {
        return cache.vendorsAppCssLinkHref;
    }

    const file = path.join(appDir, "./web/vendors~app.css");
    const stat = fs.statSync(file);

    if (!stat.isFile()) {
        throw new Error(`Location "${file}" exists but it's not a file`);
    }

    return cache.vendorsAppCssLinkHref = formatFileUrl(file);
}

export async function injectVendorsAppCssIntoHtmlFile(
    pageLocation: string,
    {appDir}: Pick<Context["locations"], "appDir">,
): Promise<{ html: string; baseURLForDataURL: string }> {
    const pageContent = fs.readFileSync(pageLocation).toString();
    const baseURLForDataURL = formatFileUrl(`${path.dirname(pageLocation)}${path.sep}`);
    const vendorCssHref = resolveVendorsAppCssLinkHref({appDir});
    const htmlInjection = `<link rel="stylesheet" href="${vendorCssHref}"/>`;
    const html = pageContent.replace(/(.*)(<head>)(.*)/i, `$1$2${htmlInjection}$3`);

    if (!html.includes(htmlInjection)) {
        logger.error(JSON.stringify({html}));
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
        end() {
            const time = process.hrtime(start);

            return Math.round((time[0] * 1000) + (time[1] / 1000000));
        },
    };
}

export function formatFileUrl(pathname: string): string {
    return url.format({pathname, protocol: "file:", slashes: true});
}
