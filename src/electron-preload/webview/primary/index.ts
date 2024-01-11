import {IPC_WEBVIEW_API_CHANNELS_MAP} from "src/shared/api/webview/const";
import {PROTON_APP_MAIL_LOGIN_PATHNAME} from "src/shared/const/proton-url";

const main = async (): Promise<void> => {
    const [
        {ipcRenderer},
        {WEBVIEW_LOGGERS},
        {curryFunctionMembers},
        {testProtonMailAppPage},
        {documentCookiesForCustomScheme, attachUnhandledErrorHandler},
        {getLocationHref},
        {initProviderApi},
        {registerApi},
        {registerApi: registerLoginApi},
        {setupProtonOpenNewTabEventHandler},
        {setupProviderIntegration},
    ] = await Promise.all([
        import("electron"),
        import("src/electron-preload/webview/lib/const"),
        import("src/shared/util"),
        import("src/shared/util/proton-webclient"),
        import("src/electron-preload/webview/lib/util"),
        import("src/shared/util/web"),
        import("./provider-api"),
        import("./api"),
        import("./api/login"),
        import("src/electron-preload/webview/lib/custom-event"),
        import("./provider-api/setup"),
    ]);
    const logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, __filename);

    attachUnhandledErrorHandler(logger);

    const protonAppPageStatus = testProtonMailAppPage({url: getLocationHref(), logger});

    documentCookiesForCustomScheme.enable(logger);
    setupProtonOpenNewTabEventHandler(logger);
    setupProviderIntegration(protonAppPageStatus);

    if (protonAppPageStatus.packagedWebClientUrl?.pathname === PROTON_APP_MAIL_LOGIN_PATHNAME) {
        registerLoginApi();
        return;
    }

    if (!protonAppPageStatus.shouldInitProviderApi) {
        return;
    }

    try {
        // TODO set up timeout
        registerApi(
            await initProviderApi(),
        );
    } catch (error) {
        logger.error(error);
        throw error;
    }

    ipcRenderer.sendToHost(IPC_WEBVIEW_API_CHANNELS_MAP.primary.registered);
};

(async () => {
    await main();
})().catch((error) => {
    console.error( // eslint-disable-line no-console
        typeof error === "object"
            ? (
                new Error(
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    JSON.stringify({name: String(error.name), message: String(error.message), stack: String(error.stack)}),
                )
            )
            : error,
    );
});
