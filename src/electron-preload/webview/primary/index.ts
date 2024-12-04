import {disableBrowserNotificationFeature} from "src/electron-preload/webview/lib/util";
import {WEBVIEW_PRIMARY_INTERNALS_APP_TYPES} from "./common/provider-api/const";
import {PROTON_APP_MAIL_LOGIN_PATHNAME} from "src/shared/const/proton-url";

const main = async (): Promise<void> => {
    const [
        {WEBVIEW_LOGGERS},
        {curryFunctionMembers},
        {testProtonAppPage},
        {documentCookiesForCustomScheme, attachUnhandledErrorHandler},
        {getLocationHref},
        {initProviderApi: initCommonProviderApi},
        {initProviderApi: initMailProviderApi},
        {registerApi: registerCommonApi},
        {registerApi: registerMailApi},
        {registerApi: registerLoginApi},
        {setupProtonOpenNewTabEventHandler},
        {setupProviderIntegration},
    ] = await Promise.all([
        import("src/electron-preload/webview/lib/const"),
        import("src/shared/util"),
        import("src/shared/util/proton-webclient"),
        import("src/electron-preload/webview/lib/util"),
        import("src/shared/util/web"),
        import("./common/provider-api"),
        import("./mail/provider-api"),
        import("./common/api"),
        import("./mail/api"),
        import("./mail/api/login"),
        import("src/electron-preload/webview/lib/custom-event"),
        import("./mail/provider-api/setup"),
    ]);
    const logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, __filename);

    attachUnhandledErrorHandler(logger);
    documentCookiesForCustomScheme.enable(logger);
    setupProtonOpenNewTabEventHandler(logger);

    // TODO use "mapToObj"
    const protonAppPageStatuses = {
        ["proton-mail"]: testProtonAppPage("proton-mail", {url: getLocationHref(), logger}),
        ["proton-calendar"]: testProtonAppPage("proton-calendar", {url: getLocationHref(), logger}),
        ["proton-drive"]: testProtonAppPage("proton-drive", {url: getLocationHref(), logger}),
    } as const;

    if (!Object.values(protonAppPageStatuses).some((v) => v.blankHtmlPage)) {
        setupProviderIntegration();
    }

    if (Object.values(protonAppPageStatuses).some((v) => v.packagedWebClientUrl?.pathname === PROTON_APP_MAIL_LOGIN_PATHNAME)) {
        registerLoginApi();
        return;
    }

    // TODO "provider APIs" timeouts
    if (protonAppPageStatuses["proton-mail"].targetedProtonProject) {
        disableBrowserNotificationFeature(logger);
        const [commonProviderApi, mainProviderApi] = await Promise.all([
            initCommonProviderApi("proton-mail"),
            initMailProviderApi(),
        ]);
        registerCommonApi(commonProviderApi, logger);
        registerMailApi(commonProviderApi, mainProviderApi);
    } else {
        for (const type of WEBVIEW_PRIMARY_INTERNALS_APP_TYPES) {
            if (!protonAppPageStatuses[type].targetedProtonProject) continue;
            const commonProviderApi = await initCommonProviderApi(type);
            registerCommonApi(commonProviderApi, logger);
            break;
        }
    }
};

(async () => {
    await main();
})().catch((error) => {
    console.error( // eslint-disable-line no-console
        typeof error === "object"
            ? (new Error(
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                JSON.stringify({name: String(error.name), message: String(error.message), stack: String(error.stack)}),
            ))
            : error,
    );
});
