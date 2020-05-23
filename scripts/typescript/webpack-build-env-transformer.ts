import * as ts from "typescript";

import {buildBaseConfig} from "webpack-configs/lib";

const definePluginNodeEnvKey = "BUILD_ENVIRONMENT";

function resolveBuildEnvironment(): string {
    // TODO pick "DefinePlugin" as webpack.DefinePlugin.constructor.name
    const definePluginConstructorName = "DefinePlugin";
    const definePluginInstance = buildBaseConfig({}).plugins?.find((plugin) => {
        return plugin.constructor.name === definePluginConstructorName;
    });

    if (!definePluginInstance) {
        throw new Error(`Failed to resolve "${definePluginConstructorName}" plugin instance`);
    }

    // TODO infer "definitions" type from "DefinePlugin" constructor args
    const {definitions = {}} = (definePluginInstance as { definitions?: { [key: string]: string | undefined } });
    const result = definitions[definePluginNodeEnvKey];

    if (typeof result !== "string" || !result) {
        throw new Error(`Resolve falsy "${definePluginConstructorName}.${definePluginNodeEnvKey}" definition"`);
    }

    return JSON.parse(result); // eslint-disable-line @typescript-eslint/no-unsafe-return
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export default function(/*  ts.Program , <options object> */) {
    const buildEnvironment = resolveBuildEnvironment();

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    return (ctx: ts.TransformationContext) => {
        function visitor(node: ts.Node): ts.Node {
            if (
                node.kind === ts.SyntaxKind.Identifier
                &&
                node.getText() === definePluginNodeEnvKey
            ) {
                return ts.createLiteral(buildEnvironment);
            }

            return ts.visitEachChild(node, visitor, ctx);
        }

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        return (sourceFile: ts.SourceFile) => {
            return ts.visitEachChild(sourceFile, visitor, ctx);
        };
    };
}
