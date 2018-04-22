// tslint:disable:object-literal-sort-keys

// TODO make all the configs extend this config as a base
// it"s currently needed for the automatic alias resolving by WebStorm IDE, it doesn"t support multiple webpack configs

const path = require("path");

const rootContext = path.resolve(".");

const config = {
    resolve: {
        extensions: ["*", ".js", ".ts"],
        alias: {
            "_root": rootContext,
            "_web_src": path.join(rootContext, "./src/web/src/"),
            "_shared": path.join(rootContext, "./src/shared/"),
            "_web_app": path.join(rootContext, "./src/web/src/app/"),
        },
    },
};

// config should be returned in order to let Webstorm IDE resolve aliases
module.exports = config;
