import chalk from "chalk";
import fs from "fs";
import path from "path";
import {promisify} from "util";

import {FolderAsDomainEntry, execAccountTypeFlow} from "./lib";
import {Unpacked} from "src/shared/types";
import {consoleLevels, consoleLog, execShell} from "scripts/lib";

// tslint:disable-next-line:no-var-requires no-import-zones
const {name: APP_NAME} = require("package.json");

const folderAsDomainEntries: Array<FolderAsDomainEntry<{
    configApiParam:
        | "email-securely-app:app.protonmail.ch"
        | "email-securely-app:mail.protonmail.com"
        | "email-securely-app:protonirockerxow.onion";
}>> = [
    {
        folderNameAsDomain: "app.protonmail.ch",
        options: {
            configApiParam: "email-securely-app:app.protonmail.ch",
        },
    },
    {
        folderNameAsDomain: "mail.protonmail.com",
        options: {
            configApiParam: "email-securely-app:mail.protonmail.com",
        },
    },
    {
        folderNameAsDomain: "protonirockerxow.onion",
        options: {
            configApiParam: "email-securely-app:protonirockerxow.onion",
        },
    },
];

execAccountTypeFlow({
    accountType: "protonmail",
    folderAsDomainEntries,
    repoRelativeDistDir: "./dist",
    flows: {
        preInstall: async ({repoDir: cwd}) => {
            const problematicModule = {name: "loader-utils", workingVersion: "1.1.0"};
            const packageJsonFile = path.join(cwd, "./package.json");
            const packageJson: { devDependencies: Record<string, string> } = JSON.parse(
                (await promisify(fs.readFile)(packageJsonFile)).toString(),
            );

            if (problematicModule.name in packageJson.devDependencies) {
                return;
            }

            packageJson.devDependencies[problematicModule.name] = problematicModule.workingVersion;
            const packageJsonContent = JSON.stringify(packageJson, null, 2);

            consoleLog(
                chalk.magenta(`Writing ${consoleLevels.value(packageJsonFile)} file with content:`),
                consoleLevels.value(packageJsonContent),
            );
            await promisify(fs.writeFile)(packageJsonFile, packageJsonContent);
        },
        build: async ({repoDir, folderAsDomainEntry}) => {
            await build({repoDir, ...folderAsDomainEntry});
        },
    },
}).catch((error) => {
    consoleLog(consoleLevels.error(error));
    process.exit(1);
});

async function build({repoDir: cwd, options, folderNameAsDomain}: { repoDir: string; } & Unpacked<typeof folderAsDomainEntries>) {
    // configuring
    await (async () => {
        const {configApiParam} = options;
        const envFile = path.join(cwd, "./env/env.json");
        const envFileContent = JSON.stringify({
            [configApiParam]: {
                api: `https://${folderNameAsDomain}/api`,
                sentry: {},
            },
        }, null, 2);

        consoleLog(
            chalk.magenta(`Writing ${consoleLevels.value(envFile)} file with content:`),
            consoleLevels.value(envFileContent),
        );
        await promisify(fs.writeFile)(envFile, envFileContent);

        await execShell(["npm", ["run", "config", "--", "--api", configApiParam, "--debug", "true"], {cwd}]);
    })();

    // building
    await (async () => {
        const webpackFile = path.join(cwd, `./webpack.config.${APP_NAME}.js`);
        // tslint:disable:no-trailing-whitespace
        const webpackFileContent = `
            const UglifyJsPlugin = require("uglifyjs-webpack-plugin");
            const config = require("./webpack.config");
            
            config.optimization.minimizer.forEach((minimizer) => {
                if (minimizer.constructor.name === "TerserPlugin") {
                    minimizer.options.include = "./src";
                    minimizer.options.parallel = false;
                    minimizer.options.cache = false;
                }
            });
            
            config.plugins = config.plugins.filter((plugin) => {
                switch (plugin.constructor.name) {
                    case "HtmlWebpackPlugin":
                        plugin.options.minify = false;
                        break;
                    case "OptimizeCSSAssetsPlugin":
                        return false;
                    // case "ImageminPlugin":
                    //     return false;
                }
                return true;
            })
            
            module.exports = config;
        `;
        // tslint:enable:no-trailing-whitespace

        consoleLog(
            chalk.magenta(`Writing ${consoleLevels.value(webpackFile)} file with content:`),
            consoleLevels.value(webpackFileContent),
        );
        await promisify(fs.writeFile)(webpackFile, webpackFileContent);

        await execShell(["npm", ["run", "dist", "--", "--progress", "false", "--config", webpackFile], {cwd}]);
    })();
}
