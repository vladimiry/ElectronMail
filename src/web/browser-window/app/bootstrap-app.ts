import {enableProdMode} from "@angular/core";
import {platformBrowserDynamic} from "@angular/platform-browser-dynamic";

import {AppModule} from "./app.module";
import {getZoneNameBoundWebLogger} from "src/web/browser-window/util";

const logger = getZoneNameBoundWebLogger("[bootstrap-app]");

// TODO call "enableProdMode()" only in prod mode
// after angular@8.0.1=>8.0.1 update angular stopped working without enabling prod mode (in dev mode)
// if (BUILD_ENVIRONMENT !== "development") {
enableProdMode();
// }

__ELECTRON_EXPOSURE__.buildIpcMainClient()("staticInit")()
    .then((staticInit) => {
        const metadata: typeof __METADATA__ = staticInit;

        Object.defineProperty(
            window,
            "__METADATA__",
            {
                value: metadata,
                configurable: false,
                enumerable: false,
                writable: false,
            },
        );

        // if AOT compilation enabled "platformBrowserDynamic" is being on-the-fly patched by "@ngtools/webpack"
        // to use "platformBrowser" imported from from "@angular/platform-browser";

        return platformBrowserDynamic().bootstrapModule(AppModule);
    })
    .catch((error) => {
        // tslint:disable-next-line:no-console
        console.error(error);
        logger.error(error);
        throw error;
    });
