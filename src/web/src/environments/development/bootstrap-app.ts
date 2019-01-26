import {ApplicationRef} from "@angular/core";
import {bootloader, hmrModule} from "@angularclass/hmr";
import {enableDebugTools} from "@angular/platform-browser";
import {platformBrowserDynamic} from "@angular/platform-browser-dynamic";

import {AppModule} from "./app.module";
import {getZoneNameBoundWebLogger} from "src/web/src/util";

const logger = getZoneNameBoundWebLogger("[environments/development/bootstrap-app]");

bootloader(async () => {
    try {
        const ngModuleRef = await platformBrowserDynamic().bootstrapModule(AppModule);
        const applicationRef = ngModuleRef.injector.get(ApplicationRef);
        const componentRef = applicationRef.components[0];

        enableDebugTools(componentRef);

        if (!module.hot) {
            throw new Error("webpack-dev-server: HMR is not enabled");
        }

        return hmrModule(ngModuleRef, module);
    } catch (error) {
        // tslint:disable-next-line:no-console
        console.error(error);
        logger.error(error);
        throw error;
    }
});
