import {enableProdMode} from "@angular/core";
import {platformBrowserDynamic} from "@angular/platform-browser-dynamic";

import {AppModule} from "./app.module";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

const logger = getZoneNameBoundWebLogger("[bootstrap-app]");

// TODO call "enableProdMode()" only in prod mode
// after angular@8.0.1=>8.0.1 update angular stopped working without enabling prod mode (in dev mode)
// if ((process.env.NODE_ENV as BuildEnvironment) !== "development") {
enableProdMode();
// }

// if AOT compilation enabled "platformBrowserDynamic" is being on-the-fly patched by "@ngtools/webpack"
// to use "platformBrowser" imported from from "@angular/platform-browser";
platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((error) => {
        // tslint:disable-next-line:no-console
        console.error(error);
        logger.error(error);
        throw error;
    });
