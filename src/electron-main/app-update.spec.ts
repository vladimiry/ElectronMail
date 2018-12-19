import rewiremock from "rewiremock";
import sinon from "sinon";
import test from "ava";

test.serial("initAutoUpdate", async (t) => {
    const loggerSpy = sinon.spy();
    const electronUpdaterLibrary = {
        autoUpdater: {
            checkForUpdatesAndNotify: sinon.stub().returns(Promise.resolve({checkForUpdatesAndNotify: () => {}})),
            logger: undefined,
        },
    };
    const library = await rewiremock.around(
        () => import("./app-update"),
        (mock) => {
            mock("electron-updater")
                .with(electronUpdaterLibrary);
            mock("electron-log")
                .with(loggerSpy);
        },
    );

    library.initAutoUpdate();

    t.is(electronUpdaterLibrary.autoUpdater.logger, loggerSpy, `"autoUpdater.logger" set to "electron-log"`);
    t.true(electronUpdaterLibrary.autoUpdater.checkForUpdatesAndNotify.calledWithExactly(), `"checkForUpdatesAndNotify" called`);
});
