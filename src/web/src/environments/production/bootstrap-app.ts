import {enableProdMode} from "@angular/core";
import {platformBrowserDynamic} from "@angular/platform-browser-dynamic";

import {AppModule} from "./app.module";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

const logger = getZoneNameBoundWebLogger("[environments/production/bootstrap-app]");

// TODO get rid of "onload" handler, see https://github.com/electron/electron/issues/17526
window.addEventListener("load", () => {
    enableProdMode();

    platformBrowserDynamic()
        .bootstrapModule(AppModule)
        .catch((error) => {
            // tslint:disable-next-line:no-console
            console.error(error);
            logger.error(error);
            throw error;
        });
});
