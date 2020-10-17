// TODO resolve "ARTIFACT_NAME_POSTFIX" value programmatically from "electron-builder.yml"
import path from "path";

export const ARTIFACT_NAME_POSTFIX_ENV_VAR_NAME = "ARTIFACT_NAME_POSTFIX";

export const CWD_ABSOLUTE_DIR = path.resolve(process.cwd());

export const OUTPUT_ABSOLUTE_DIR = path.join(CWD_ABSOLUTE_DIR, "./output");

export const GIT_CLONE_ABSOLUTE_DIR = path.join(OUTPUT_ABSOLUTE_DIR, "./git");
