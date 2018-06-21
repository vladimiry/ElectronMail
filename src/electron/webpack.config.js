// tslint:disable:object-literal-sort-keys

// TODO get rid of webpack for the electron building on resolving https://github.com/Microsoft/TypeScript/issues/15479

const path = require("path");
const CircularDependencyPlugin = require("circular-dependency-plugin");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");

module.exports.generateConfig = ({context}) => {
    const rootContext = process.cwd();
    const rootConfig = require(path.join(rootContext, "webpack.config.js"));
    const tsConfigPath = path.join(context, "./tsconfig.json");

    const envs = {
        development: "development",
        production: "production",
        test: "test",
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
        },
    };

    // tslint:disable-next-line:no-console
    console.log(`metadata: ${JSON.stringify(metadata, null, 4)}`);

    if (!(metadata.env.value in envs)) {
        throw new Error("'NODE_ENV_RUNTIME' is not defined");
    }

    const config = {
        mode: metadata.env.isProduction() ? "production" : "development",
        devtool: metadata.env.isProduction() ? "source-map" : "inline-source-map",
        module: {
            rules: [
                {
                    exclude: /node_modules/,
                    test: /\.ts$/,
                    use: [
                        {
                            loader: "awesome-typescript-loader",
                            options: {
                                configFileName: metadata.paths.tsConfig,
                            },
                        },
                    ],
                },
            ],
        },
        node: {
            __dirname: false,
            __filename: false,
        },
        output: {
            filename: `[name].js`,
            path: path.resolve(metadata.paths.rootContext, "./app/electron"),
        },
        resolve: {
            alias: {
                ...rootConfig.resolve.alias,
            },
            extensions: ["*", ".js", ".ts"],
            plugins: [
                new TsconfigPathsPlugin({configFile: metadata.paths.tsConfig}),
            ],
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
