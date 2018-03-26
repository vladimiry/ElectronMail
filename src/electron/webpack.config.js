// TODO get rid of webpack for the electron building on resolving https://github.com/Microsoft/TypeScript/issues/15479

const path = require('path');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports.generateConfig = ({context}) => {
    const rootContext = process.cwd();
    const rootConfig = require(path.join(rootContext, 'webpack.config.js'));
    const tsConfigPath = path.join(context, "./tsconfig.json");

    const envs = {
        production: 'production',
        development: 'development',
        test: 'test',
    };

    const metadata = {
        env: {
            value: process.env.NODE_ENV_RUNTIME || envs.development,
            isProduction() {
                return this.value === envs.production;
            },
            isDevelopment() {
                return this.value === envs.development;
            },
            isTest() {
                return this.value === envs.test;
            },
        },
        paths: {
            context,
            rootContext,
            tsConfig: tsConfigPath,
        }
    };

    metadata.sourceMap = true; // !metadata.env.isProduction();

    console.log(`metadata: ${JSON.stringify(metadata, null, 4)}`);

    if (!(metadata.env.value in envs)) {
        throw new Error('"NODE_ENV_RUNTIME" is not defined');
    }

    const config = {
        mode: metadata.env.isProduction() ? "production" : "development",
        node: {
            __dirname: false,
            __filename: false,
        },
        output: {
            filename: `[name].js`,
            path: path.resolve(metadata.paths.rootContext, './app/electron'),
        },
        resolve: {
            extensions: ['*', '.js', '.ts'],
            alias: {
                ...rootConfig.resolve.alias,
            },
            plugins: [
                new TsconfigPathsPlugin({configFile: metadata.paths.tsConfig}),
            ],
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: [
                        {
                            loader: 'awesome-typescript-loader',
                            options: {
                                configFileName: metadata.paths.tsConfig,
                            }
                        }
                    ],
                    exclude: /node_modules/
                }
            ]
        },
        plugins: [
            new CircularDependencyPlugin({
                exclude: /node_modules/,
                failOnError: true,
            }),
        ],
    };

    return {metadata, config};
};
