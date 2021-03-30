import * as ts from "typescript";

const definePluginNodeEnvKey = "BUILD_ENVIRONMENT";

function resolveBuildEnvironment(): string {
    const result = process.env.NODE_ENV;
    if (!result) {
        throw new Error(`"${definePluginNodeEnvKey}" resolving failed`);
    }
    return result;
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
