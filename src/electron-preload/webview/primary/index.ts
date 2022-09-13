const main = async (): Promise<void> => {
    const [
        {WEBVIEW_LOGGERS},
        {curryFunctionMembers},
        {testProtonMailAppPage},
        {documentCookiesForCustomScheme, getLocationHref, attachUnhandledErrorHandler},
        {initProviderApi},
        {registerApi},
        {setupProtonOpenNewTabEventHandler},
        {setupProviderIntegration},
    ] = await Promise.all([
        import("src/electron-preload/webview/lib/const"),
        import("src/shared/util"),
        import("src/shared/util/proton-webclient"),
        import("src/electron-preload/webview/lib/util"),
        import("./provider-api"),
        import("./api"),
        import("src/electron-preload/webview/lib/custom-event"),
        import("./provider-api/setup"),
    ]);
    const logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, __filename);

    attachUnhandledErrorHandler(logger);

    const protonAppPageStatus = testProtonMailAppPage({url: getLocationHref(), logger});

    documentCookiesForCustomScheme.enable(logger);
    setupProtonOpenNewTabEventHandler(logger);
    setupProviderIntegration(protonAppPageStatus);

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
