import {chmodSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";

import {BINARY_NAME} from "src/shared/const";
import {CONSOLE_LOG} from "scripts/lib";

// - "apps.<app-name>.command" is strictly validated during "snap" package building via "snapcraft expand-extensions" call
//   for example a "commmand" with the following arg gets rejected for forbidden characters use: '--js-flags="--max-old-space-size=12288"'
//   see https://documentation.ubuntu.com/snapcraft/stable/reference/snapcraft-yaml/#apps.%3Capp-name%3E.command
// - so this script simply wraps the command into the sh script file
// - the script call being injectet into "node_modules/app-builder-lib" by "patches/app-builder-lib.patch"

// declare const BUILD_HOOK_NAME: string;
declare const BUILD_HOOK_HOOK_PRINT_PREFIX: string;
CONSOLE_LOG(`${BUILD_HOOK_HOOK_PRINT_PREFIX} start`);

const SNAPCARFT_YAML_FILE_NAME = "snapcraft.yaml";
const WRAPPER_FILE_NAME = `${BINARY_NAME}-wrapper`;
const ORGANIZE_SECTION_BINARY_PATTERN = `${BINARY_NAME}: app/${BINARY_NAME}`;
const ORGANIZE_SECTION_WRAPPER_PATTERN = `${WRAPPER_FILE_NAME}: app/${WRAPPER_FILE_NAME}`;
const COMMAND_EXECUTABLE_SEARCH_PATTERN = `app/${BINARY_NAME}`;
const COMMAND_SEARCH_PATTERN = `command: ${COMMAND_EXECUTABLE_SEARCH_PATTERN} `;
const COMMAND_REPLACEMENT = `command: app/${WRAPPER_FILE_NAME}`;
const [, , SNAPCARFT_YAML_DIR, WRAPPER_FILE_DIR] = process.argv as [null, null, string | undefined, string | undefined];

if (!SNAPCARFT_YAML_DIR) {
    throw new Error(`expected first argument: path to directory with "${SNAPCARFT_YAML_FILE_NAME}" file`);
}
if (!WRAPPER_FILE_DIR) {
    throw new Error(`expected second argument: path to snap's "app" directory`);
}

const yamlFilePath = join(SNAPCARFT_YAML_DIR, SNAPCARFT_YAML_FILE_NAME);
const wrapperFilePath = join(WRAPPER_FILE_DIR, WRAPPER_FILE_NAME);

// extract the "command"
let commandArgsPart: string | undefined;
let yamlFileLines = readFileSync(yamlFilePath, "utf8").split(/\r?\n/).map((line) => {
    if (!line.includes(COMMAND_SEARCH_PATTERN) || commandArgsPart) return line;
    commandArgsPart = line.split(COMMAND_SEARCH_PATTERN)[1]?.trim();
    return line.replace(line.trim(), COMMAND_REPLACEMENT);
});
if (!commandArgsPart) {
    throw new Error(`Pattern "${COMMAND_SEARCH_PATTERN}" not found in "${yamlFilePath}"`);
}

// list wrapper script into the "organize" section right after original binary
let wrapperFileListed = false;
yamlFileLines = yamlFileLines.map((line) => {
    if (!line.includes(ORGANIZE_SECTION_BINARY_PATTERN) || wrapperFileListed) return line;
    wrapperFileListed = true;
    const indent = line.match(/^(\s*)/)?.[0] || "";
    return `${line}\n${indent}${ORGANIZE_SECTION_WRAPPER_PATTERN}`;
});
if (!wrapperFileListed) {
    throw new Error(`Could not find "${ORGANIZE_SECTION_BINARY_PATTERN}" entry in the "organize" section of "${yamlFilePath}"`);
}

const fullCommand = `${COMMAND_EXECUTABLE_SEARCH_PATTERN} ${commandArgsPart}`;
const wrapperFileContent = `#!/bin/sh\nexec $SNAP/${fullCommand} "$@"\n`;

writeFileSync(wrapperFilePath, wrapperFileContent);
chmodSync(wrapperFilePath, "755");
writeFileSync(yamlFilePath, yamlFileLines.join("\n"));

CONSOLE_LOG(`${BUILD_HOOK_HOOK_PRINT_PREFIX} moved "${fullCommand}" command from "${yamlFilePath}" to "${wrapperFilePath}"`);
