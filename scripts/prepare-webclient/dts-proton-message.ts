import {
    EnumDeclaration,
    Identifier,
    ImportDeclaration,
    InterfaceDeclaration,
    Node,
    Project,
    SourceFile,
    SyntaxKind,
    TypeAliasDeclaration,
    TypeElement,
    TypeNode,
} from "ts-morph";
import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";

import {CONSOLE_LOG} from "scripts/lib";

const INTERFACE_NAME = "Message";
const MODULE_NAME = `lib/interfaces/mail/${INTERFACE_NAME}`;

export const generateProtonMessageDeclaration = (inputFile: string, destFile: string): void => {
    if (fsExtra.pathExistsSync(destFile)) {
        CONSOLE_LOG(`The "${destFile}" file already exists.`);
        return;
    }

    CONSOLE_LOG(`Processing "${inputFile}" input file...`);

    const project = new Project({tsConfigFilePath: path.resolve(inputFile, "../../../../../../tsconfig.base.json")});
    const sourceFile = project.getSourceFileOrThrow(inputFile);
    const outputFile = project.createSourceFile(destFile, "", {overwrite: true});
    const visited = new Set<string>();
    const imports = new Map<string, Set<string>>();

    const messageInterface = sourceFile.getInterface(INTERFACE_NAME);
    if (!messageInterface) throw new Error(`"${INTERFACE_NAME}" interface not found`);

    resolveDeclaration(messageInterface);

    for (const [module, names] of imports.entries()) {
        const filteredNames = Array.from(names).filter((name) => !visited.has(name));
        if (filteredNames.length) {
            outputFile.addImportDeclaration({
                moduleSpecifier: module,
                namedImports: filteredNames,
            });
        }
    }

    outputFile.saveSync();
    fs.writeFileSync(destFile, `declare module "${MODULE_NAME}" {\n` + fs.readFileSync(destFile).toString() + "}\n");
    CONSOLE_LOG(`"${destFile}" created`);
    function resolveDeclaration(decl: InterfaceDeclaration | TypeAliasDeclaration | EnumDeclaration): void {
        const name = decl.getName();
        if (visited.has(name)) return;
        visited.add(name);
        outputFile.addStatements(decl.getText());

        const heritageClauses = "getExtends" in decl ? decl.getExtends() : undefined;
        heritageClauses?.forEach((ext) => {
            const extType = ext.getExpression().getText();
            resolveByName(extType, decl.getSourceFile());
        });

        const properties = "getProperties" in decl ? decl.getProperties() : undefined;
        properties?.forEach((prop: TypeElement) => {
            if (!Node.isPropertySignature(prop)) return;
            const typeNode: TypeNode | undefined = prop.getTypeNode();
            if (!typeNode) return;
            const identifiers: Identifier[] = typeNode.getDescendantsOfKind(SyntaxKind.Identifier);
            identifiers.forEach((id) => {
                resolveByName(id.getText(), decl.getSourceFile());
            });
        });

        collectImports(decl);
    }

    function resolveByName(name: string, fromFile: SourceFile): void {
        if (visited.has(name)) return;

        const localDecl = fromFile.getInterface(name) || fromFile.getTypeAlias(name) || fromFile.getEnum(name);
        if (localDecl) {
            resolveDeclaration(localDecl);
            return;
        }

        const importDecl = fromFile.getImportDeclarations().find((imp: ImportDeclaration) =>
            imp.getNamedImports().some((ni) => ni.getName() === name)
        );
        if (!importDecl) return;

        const module = importDecl.getModuleSpecifierValue();
        if (!visited.has(name)) {
            if (!imports.has(module)) imports.set(module, new Set());
            imports.get(module)!.add(name);
        }

        const resolvedFile = importDecl.getModuleSpecifierSourceFile();
        if (resolvedFile) {
            const decl = resolvedFile.getInterface(name) || resolvedFile.getTypeAlias(name) || resolvedFile.getEnum(name);
            if (decl) resolveDeclaration(decl);
        }
    }

    function collectImports(node: Node): void {
        const ids: Identifier[] = node.getDescendantsOfKind(SyntaxKind.Identifier);
        ids.forEach((id) => {
            const name = id.getText();
            if (visited.has(name)) return;

            const importDecl = node.getSourceFile().getImportDeclarations().find((imp: ImportDeclaration) =>
                imp.getNamedImports().some((ni) => ni.getName() === name)
            );
            if (importDecl) {
                const module = importDecl.getModuleSpecifierValue();
                if (!imports.has(module)) imports.set(module, new Set());
                imports.get(module)!.add(name);
            }
        });
    }
};
