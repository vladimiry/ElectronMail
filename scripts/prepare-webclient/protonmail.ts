import chalk from "chalk";
import fs from "fs";
import path from "path";
import {promisify} from "util";

import {FolderAsDomainEntry, execAccountTypeFlow} from "./lib";
import {Unpacked} from "src/shared/types";
import {consoleLevels, consoleLog, execShell} from "scripts/lib";

// tslint:disable-next-line:no-var-requires no-import-zones
const {name: PROJECT_NAME} = require("package.json");

const folderAsDomainEntries: Array<FolderAsDomainEntry<{
    configApiParam:
        | "electron-mail:app.protonmail.ch"
        | "electron-mail:mail.protonmail.com"
        | "electron-mail:protonirockerxow.onion";
}>> = [
    {
        folderNameAsDomain: "app.protonmail.ch",
        options: {
            configApiParam: "electron-mail:app.protonmail.ch",
        },
    },
    {
        folderNameAsDomain: "mail.protonmail.com",
        options: {
            configApiParam: "electron-mail:mail.protonmail.com",
        },
    },
    {
        folderNameAsDomain: "protonirockerxow.onion",
        options: {
            configApiParam: "electron-mail:protonirockerxow.onion",
        },
    },
];

execAccountTypeFlow({
    accountType: "protonmail",
    folderAsDomainEntries,
    repoRelativeDistDir: "./dist",
    flows: {
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
        const webpackFile = path.join(cwd, `./webpack.config.${PROJECT_NAME}.js`);
        // tslint:disable:no-trailing-whitespace
        const webpackFileContent = `
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
