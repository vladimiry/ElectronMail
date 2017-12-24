import {ApplicationRef, enableProdMode} from "@angular/core";
import {platformBrowserDynamic} from "@angular/platform-browser-dynamic";
import {enableDebugTools} from "@angular/platform-browser";
import {bootloader, hmrModule} from "@angularclass/hmr";

import "./vendor";
import "./index.scss";

import {AppModule} from "./app/app.module";

if (!APP_CONSTANTS.isDevEnv) {
    enableProdMode();
}

bootloader(async () => {
    const ngModuleRef = await platformBrowserDynamic().bootstrapModule(AppModule);

    if (APP_CONSTANTS.isDevEnv) {
        const applicationRef = ngModuleRef.injector.get(ApplicationRef);
        const componentRef = applicationRef.components[0];

        enableDebugTools(componentRef);

        if (!module.hot) {
            throw new Error("webpack-dev-server: HMR is not enabled");
        }

        return hmrModule(ngModuleRef, module);
    }

    return ngModuleRef;
});
