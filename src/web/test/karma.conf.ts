import produce from "immer";
import {Config} from "karma";

// TODO import using alias
import webpackConfig from "../../webpack/web";

const basePath = process.cwd();
const filesBootstrap = "src/web/test/bootstrap.ts";
const filesPattern = "src/web/src/**/*.spec.ts";

export default (config: Config) => {
    const TRAVIS_OS_NAME = String(process.env.TRAVIS_OS_NAME);
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
        browsers: [
            "Chrome",
        ],
        customLaunchers,
        mime: {
            "text/x-typescript": ["ts"],
        },
    };

    if (TRAVIS_OS_NAME in customLaunchers) {
        configuration.browsers = [TRAVIS_OS_NAME];
    }

    config.set(configuration);
};
