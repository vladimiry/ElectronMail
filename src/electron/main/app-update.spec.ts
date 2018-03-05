import * as sinon from "sinon";
import rewiremock from "rewiremock";
import {test} from "ava";

test.serial("initAutoUpdate", async (t) => {
    const loggerSpy = sinon.spy();
    const electronUpdaterLibrary = {
        autoUpdater: {
            checkForUpdatesAndNotify: sinon.spy(),
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
