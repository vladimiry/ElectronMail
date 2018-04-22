const path = require("path");

const {generateConfig} = require("./../webpack.config");

const context = path.resolve(__dirname);
const {config} = generateConfig({context});

config.target = "electron-renderer";
config.entry = {
    "renderer/account": path.resolve(context, "./account"),
    ...["production", "development", "e2e"].reduce((accumulator, env) => {
        const fileName = `browser-window-${env}-env`;
        accumulator[`renderer/${fileName}`] = path.resolve(context, fileName);
        return accumulator;
    }, {}),
};

module.exports = config;
