import fs from "fs";
import path from "path";
import {DllPlugin} from "webpack";
import {sync as fastGlobSync} from "fast-glob";
import {parseAndGenerateServices} from "@typescript-eslint/typescript-estree";

import {LOG, LOG_LEVELS} from "scripts/lib";
import {WEB_CHUNK_NAMES} from "src/shared/constants";
import {browserWindowPath, buildMinimalWebConfig} from "./lib";
import {sanitizeFastGlobPattern} from "src/shared/util";

const {imports} = fastGlobSync(
    [browserWindowPath("./**/*.ts"), `!${browserWindowPath("./test/**/*")}`]
        .map(sanitizeFastGlobPattern),
    {
        absolute: true,
        onlyFiles: true,
        stats: false,
    },
).reduce(
    (accumulator, file) => {
        // TODO use generic "eslint" parser
        const body = (
            parseAndGenerateServices(
                fs.readFileSync(file).toString(),
                accumulator.parseAndGenerateServicesConfig,
            ).ast.body
            ||
            []
        ) as Array<{
            type: "ImportDeclaration" | unknown;
            source?: {
                value?: string;
                type: "Literal" | unknown;
            };
        }>;

        for (const {type, source} of body) {
            if (
                type !== "ImportDeclaration"
                ||
                !source
                ||
                !source.value
                ||
                accumulator.skipImports.has(source.value)
                ||
                source.value.startsWith("src")
                ||
                source.value.startsWith(".")
            ) {
                continue;
            }
            accumulator.imports.add(source.value);
        }

        return accumulator;
    },
    {
        imports: new Set<string>(),
        parseAndGenerateServicesConfig: {},
        skipImports: new Set<string>([
            "electron-rpc-api",
            "fs-json-store-encryption-adapter",
        ]),
    },
);

LOG(
    LOG_LEVELS.title(
        "DLL bundle modules:",
    ),
    LOG_LEVELS.value(
        JSON.stringify([...imports.values()], null, 2),
    ),
);

const chunkName = WEB_CHUNK_NAMES["browser-window-dll"];

const config = buildMinimalWebConfig(
    {
        watch: false,
        target: "web",
        entry: [...imports.values()],
        output: {
            filename: `${chunkName}.js`,
            library: "[name]_[hash]",
        },
        resolve: {
            extensions: [".js"],
        },
    },
    {
        chunkName,
    },
);

if (!config.output || !config.output.path) {
    throw new Error(`"config.output.path" is undefined`);
}

(config.plugins = config.plugins || []).push(
    new DllPlugin({
        path: path.join(config.output.path, `${chunkName}-manifest.json`),
        name: "[name]_[hash]",
    }),
);

export default config;
