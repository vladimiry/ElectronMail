const path = require('path');

const {generateConfig} = require('./../webpack.config');

const context = path.resolve(__dirname);
const {config, metadata} = generateConfig({context});

config.target = 'electron-main';
config.entry = {
    'main/index': path.resolve(context, './index.ts'),
};

const packageJson = require(path.join(metadata.paths.rootContext, 'package.json'));
const dependenciesModuleNames = Object.keys(packageJson.dependencies);
const dependenciesRe = new RegExp(`^(${dependenciesModuleNames.join('|')})([\\/]?)`);
const dependencies = new Set(["devtron"]);

config.externals = [
    (context, request, callback) => {
        if (dependenciesRe.test(request) || dependencies.has(request)) {
            return callback(null, `require('${request}')`);
        }
        callback();
    }
];

module.exports = config;
