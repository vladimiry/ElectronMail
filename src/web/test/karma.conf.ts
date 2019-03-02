import {Config} from "karma";
import {produce} from "immer";

// TODO import using alias
import webpackConfig from "../../webpack/web";

const basePath = process.cwd();
const filesBootstrap = "src/web/test/bootstrap.ts";
const filesPattern = "src/web/src/**/*.spec.ts";

const customLaunchers = {
    linux: {
        base: "Chrome",
        flags: ["--no-sandbox"],
    },
    osx: {
        base: "Firefox",
        flags: ["-headless"],
    },
};

const ENVS = {
    CI: process.env.CI,
    TRAVIS_OS_NAME: String(process.env.TRAVIS_OS_NAME),
};

const configuration = {
    basePath,
    files: [
        filesBootstrap,
        {pattern: filesPattern, watched: false},
    ],
    frameworks: ["jasmine"],
    preprocessors: {
        [filesBootstrap]: ["webpack"],
        [filesPattern]: ["webpack"],
    },
    reporters: ["progress", "mocha"],
    webpack: produce(webpackConfig, (draft) => {
        // TODO get rid of "karma-webpack" hanging workaround
        // https://github.com/webpack-contrib/karma-webpack/issues/322#issuecomment-417862717
        (draft.output = draft.output || {}).filename = "[name]";
    }),
    webpackServer: {noInfo: true},
    port: 9876,
    colors: true,
    logLevel: "INFO",
    mime: {
        "text/x-typescript": ["ts"],
    },
    browsers: [
        "Chromium",
    ],
    customLaunchers,
};

if (ENVS.CI) {
    configuration.browsers = ["Chrome"];
}

if (ENVS.TRAVIS_OS_NAME in customLaunchers) {
    configuration.browsers = [ENVS.TRAVIS_OS_NAME];
}

export default (config: Config) => {
    config.set({
        ...configuration,
        // TODO get rid of karma circular JSON stringifying error, see https://github.com/karma-runner/karma/issues/3154
        ...{toJSON: () => ({})} as any,
    });
};
