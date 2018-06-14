// tslint:disable:object-literal-sort-keys

const rootPath = process.cwd();
const webpack = require("./webpack.config.js");
const filesBootstrap = "src/web/src/test/bootstrap.ts";
const filesPattern = "src/web/src/**/*.spec.ts";

module.exports = (config) => {
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
        basePath: rootPath,
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
        webpack,
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

    if (process.env.TRAVIS_OS_NAME in customLaunchers) {
        configuration.browsers = [process.env.TRAVIS_OS_NAME];
    }

    config.set(configuration);
};
