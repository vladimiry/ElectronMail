import fs from "fs";
import path from "path";

const filePatterns = [
    `const moduleFactory = yield compiler.compileModuleAsync(DbViewModule);`,
    `const apiClient = yield resolvePrimaryWebViewApiClient();`,
    `customCssKey = yield webView.insertCSS(customCSS);`,
] as const;

const fileAppRelativeLocation = "./web/browser-window/_accounts.mjs";

const fileLocation = path.join(process.env.NODE_ENV === "development" ? "./app-dev" : "./app", fileAppRelativeLocation);

const fileContent = fs.readFileSync(fileLocation).toString();

if (filePatterns.some((pattern) => !fileContent.includes(pattern))) {
    throw new Error(`Failed to resolve all the scan patterns in the "${fileLocation}" file`);
}
