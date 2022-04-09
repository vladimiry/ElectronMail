import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";

import {BROWSER_WINDOW_RELATIVE_DESKTOP_NOTIFICATION_ICON} from "src/shared/constants";

const appDir = process.env.NODE_ENV === "development" ? "./app-dev" : "./app";

// test async downlevel complete
((): void => {
    const filePatterns = [
        `const moduleFactory = yield compiler.compileModuleAsync(DbViewModule);`,
        `const apiClient = yield resolvePrimaryWebViewApiClient();`,
        `customCssKey = yield webView.insertCSS(customCSS);`,
    ] as const;
    const fileLocation = path.join(appDir, "./web/browser-window/_accounts.mjs");
    const fileContent = fs.readFileSync(fileLocation).toString();

    if (filePatterns.some((pattern) => !fileContent.includes(pattern))) {
        throw new Error(`Failed to resolve all the scan patterns in the "${fileLocation}" file`);
    }
})();

// copy desktop notification icon
((): void => {
    const destFilePath = path.join(appDir, "./web", BROWSER_WINDOW_RELATIVE_DESKTOP_NOTIFICATION_ICON);
    fs.copyFileSync("./src/assets/dist/icons/icon.png", destFilePath);

    if (!fsExtra.pathExistsSync(destFilePath)) {
        throw new Error(`Failed to resolve "${destFilePath}" file`);
    }
})();
