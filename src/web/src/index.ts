import {ApplicationRef, enableProdMode} from "@angular/core";
import {bootloader, hmrModule} from "@angularclass/hmr"; // TODO do not load HMR stuff for production build
import {enableDebugTools} from "@angular/platform-browser";
import {platformBrowserDynamic} from "@angular/platform-browser-dynamic";

import "./vendor/index";
import "./index.scss";

import {AppModule} from "./app/app.module";
import {BuildEnvironment} from "_@shared/model/common";

if ("production" === (process.env.NODE_ENV as BuildEnvironment)) {
    enableProdMode();
}

bootloader(async () => {
    const ngModuleRef = await platformBrowserDynamic().bootstrapModule(AppModule);

    if ("development" === (process.env.NODE_ENV as BuildEnvironment)) {
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
