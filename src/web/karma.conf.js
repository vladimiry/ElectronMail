// tslint:disable:object-literal-sort-keys

const rootPath = process.cwd();
const webpack = require("./webpack.config.js");
const pattern = "src/web/src/**/*.spec.ts";

module.exports = (config) => {
    const configuration = {
        basePath: rootPath,
        files: [
            "src/web/src/test/bootstrap.ts",
            {pattern: pattern, watched: false},
        ],
        frameworks: ["jasmine"],
        preprocessors: {
            "src/web/src/test/bootstrap.ts": ["webpack"],
            [pattern]: ["webpack"],
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
        customLaunchers: {
            Chrome_travis_ci: {
                base: "Chrome",
                flags: ["--no-sandbox"],
            },
        },
        mime: {
            "text/x-typescript": ["ts"],
        },
    };

    if (process.env.TRAVIS) {
        configuration.browsers = ["Chrome_travis_ci"];
    }

    config.set(configuration);
};
