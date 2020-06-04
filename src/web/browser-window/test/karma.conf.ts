import {Config} from "karma";
import {produce} from "immer";

// TODO import using alias
import webpackConfig from "../../../../webpack-configs/web/browser-window";

const basePath = process.cwd();
const filesBootstrap = "src/web/browser-window/test/bootstrap.ts";
const filesPattern = "src/web/browser-window/**/*.spec.ts";
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
    reporters: ["progress"],
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
    browsers: ["jsdom"],
};

export default (config: Config): void => {
    config.set({
        ...configuration,
        // TODO get rid of karma circular JSON stringifying error, see https://github.com/karma-runner/karma/issues/3154
        ...{toJSON: () => ({})} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    });
};
