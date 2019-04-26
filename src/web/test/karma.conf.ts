import {Config} from "karma";
import {platform} from "os";
import {produce} from "immer";

// TODO import using alias
import webpackConfig from "../../webpack/web";

const basePath = process.cwd();
const filesBootstrap = "src/web/test/bootstrap.ts";
const filesPattern = "src/web/src/**/*.spec.ts";
const defaultBrowser = "headlessFirefox";
// TODO firefox fails to start on "windows os" under "travis ci" environment, so using chrome for now
const useChrome = process.env.CI && platform() === "win32";
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
        useChrome
            ? "Chrome"
            : defaultBrowser,
    ],
    customLaunchers: {
        [defaultBrowser]: {
            base: "Firefox",
            flags: ["-headless"],
        },
    },
};

export default (config: Config) => {
    config.set({
        ...configuration,
        // TODO get rid of karma circular JSON stringifying error, see https://github.com/karma-runner/karma/issues/3154
        ...{toJSON: () => ({})} as any,
    });
};
