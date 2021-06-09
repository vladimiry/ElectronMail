import _logger from "electron-log";
import sanitizeHtml from "sanitize-html";
import {BrowserWindow} from "electron";
import {first} from "rxjs/operators";
import {lastValueFrom} from "rxjs";

import {Context} from "src/electron-main/model";
import {DEFAULT_WEB_PREFERENCES} from "./constants";
import {
    PACKAGE_DESCRIPTION,
    PACKAGE_GITHUB_PROJECT_URL,
    PACKAGE_LICENSE,
    PACKAGE_VERSION,
    PRODUCT_NAME,
    WEB_PROTOCOL_SCHEME,
    ZOOM_FACTOR_DEFAULT,
} from "src/shared/constants";
import {WEBPACK_WEB_CHUNK_NAMES} from "src/shared/webpack-conts";
import {applyZoomFactor} from "src/electron-main/window/util";
import {curryFunctionMembers} from "src/shared/util";
import {injectVendorsAppCssIntoHtmlFile, resolveUiContextStrict} from "src/electron-main/util";

const logger = curryFunctionMembers(_logger, __filename);

const resolveContent = async (ctx: Context): Promise<Unpacked<ReturnType<typeof injectVendorsAppCssIntoHtmlFile>>> => {
    const {commit, shortCommit} = await import("./about.json");
    const htmlInjection: string = [
        sanitizeHtml(
            `
                <h1 style="position: relative;">
                    ${PRODUCT_NAME} v${PACKAGE_VERSION}
                    <a
                        href="${PACKAGE_GITHUB_PROJECT_URL}/commit/${commit}"
                        style="position: absolute; left: 100%; bottom: 100%; font-size: 1rem;"
                    >
                        ${shortCommit}
                    </a>
                </h1>
                <p>${PACKAGE_DESCRIPTION}</p>
                <p>Distributed under ${PACKAGE_LICENSE} license.</p>
            `,
            {
                allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1"]),
                allowedAttributes: {
                    a: ["href", "style"],
                    h1: ["style"],
                },
            },
        ),
        ((): string => {
            const {versions} = process;
            const props = [
                {prop: "electron", title: "Electron"},
                {prop: "chrome", title: "Chromium"},
                {prop: "node", title: "Node"},
                {prop: "v8", title: "V8"},
            ] as const;
            return `
                <ul class="list-versions align-items-left justify-content-center font-weight-light text-muted">
                    ${props.map(({prop, title}) => sanitizeHtml(`<li>${title}: ${versions[prop]}</li>`)).join("")}
                </ul>
            `;
        })(),
    ].join("");
    const pageLocation = ctx.locations.aboutBrowserWindowPage;
    const injection = await injectVendorsAppCssIntoHtmlFile(pageLocation, ctx.locations);

    injection.html = injection.html.replace(
        /(.*)#MAIN_PROCESS_INJECTION_POINTCUT#(.*)/i,
        `$1${htmlInjection}$2`,
    );

    if (!injection.html.includes(htmlInjection)) {
        logger.error(nameof(resolveContent), injection.html);
        throw new Error(`Failed to inject "${htmlInjection}" into the "${pageLocation}" page`);
    }
    logger.verbose(nameof(resolveContent), JSON.stringify(injection));

    return injection;
};

export async function showAboutBrowserWindow(ctx: Context): Promise<BrowserWindow> {
    const uiContext = await resolveUiContextStrict(ctx);
    const {aboutBrowserWindow: exitingBrowserWindow} = uiContext;

    if (exitingBrowserWindow && !exitingBrowserWindow.isDestroyed()) {
        exitingBrowserWindow.center();
        exitingBrowserWindow.show();
        exitingBrowserWindow.focus();
        return exitingBrowserWindow;
    }

    const config = await lastValueFrom(ctx.config$.pipe(first()));
    const {zoomFactor} = config;
    const windowSizeFactor = zoomFactor > 1 && zoomFactor < 3
        ? zoomFactor
        : 1;
    const browserWindow = new BrowserWindow({
        title: `About ${PRODUCT_NAME}`,
        center: true,
        modal: true,
        autoHideMenuBar: true,
        show: false,
        width: 650 * windowSizeFactor,
        height: 500 * windowSizeFactor,
        webPreferences: {
            ...DEFAULT_WEB_PREFERENCES,
            preload: ctx.locations.preload.aboutBrowserWindow,
        },
    });

    browserWindow
        .once("ready-to-show", async () => {
            if (zoomFactor !== ZOOM_FACTOR_DEFAULT) {
                await applyZoomFactor(ctx, browserWindow.webContents);
            }
            browserWindow.show();
            browserWindow.focus();
        })
        .on("closed", () => {
            delete uiContext?.aboutBrowserWindow;
        });

    uiContext.aboutBrowserWindow = browserWindow;

    const {html} = await resolveContent(ctx);

    await browserWindow.webContents.loadURL(
        `data:text/html,${html}`,
        {baseURLForDataURL: `${WEB_PROTOCOL_SCHEME}:/${WEBPACK_WEB_CHUNK_NAMES.about}/`},
    );

    if (BUILD_ENVIRONMENT === "development") {
        browserWindow.webContents.openDevTools();
    }

    return browserWindow;
}
