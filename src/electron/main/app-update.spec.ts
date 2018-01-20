import * as sinon from "sinon";
import rewiremock from "rewiremock";
import {test} from "ava";

import {CHECK_INTERVAL_MS} from "./app-update";

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

    const setIntervalReference = setInterval;
    (setInterval as any) = sinon.spy();

    library.initAutoUpdate();

    t.true(
        (setInterval as sinon.SinonSpy).calledWith(
            sinon.match((value: any) => String(value).indexOf("autoUpdater.checkForUpdatesAndNotify()") !== -1),
            CHECK_INTERVAL_MS,
        ),
        `"setInterval" called`,
    );
    (setInterval as any) = setIntervalReference;

    t.is(electronUpdaterLibrary.autoUpdater.logger, loggerSpy, `"autoUpdater.logger" set to "electron-log"`);
    t.true(electronUpdaterLibrary.autoUpdater.checkForUpdatesAndNotify.calledWithExactly(), `"checkForUpdatesAndNotify" called`);
});
