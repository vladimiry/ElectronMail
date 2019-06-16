import {enableProdMode} from "@angular/core";
import {platformBrowserDynamic} from "@angular/platform-browser-dynamic";

import {AppModule} from "./app.module";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

const logger = getZoneNameBoundWebLogger("[environments/production/bootstrap-app]");

enableProdMode();

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((error) => {
        // tslint:disable-next-line:no-console
        console.error(error);
        logger.error(error);
        throw error;
    });
