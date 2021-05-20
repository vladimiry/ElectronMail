// TODO webpack v5: remove "require/var-requires"-based imports

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const nodeExternals: (
    options?: {
        modulesFromFile?: {
            excludeFromBundle?: string[],
        },
    },
) => Unpacked<Required<import("webpack").Configuration>["externals"]>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
    = require("webpack-node-externals");

declare class MiniCssExtractPluginClass {
    public static readonly loader: string;

    constructor();

    apply(compiler: import("webpack").Compiler): void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const MiniCssExtractPlugin: typeof MiniCssExtractPluginClass
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
    = require("mini-css-extract-plugin");

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const postCssUrl: () => unknown
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
    = require("postcss-url");
