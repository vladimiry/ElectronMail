import path from "path";

export const CWD_ABSOLUTE_DIR = path.resolve(process.cwd());

export const OUTPUT_ABSOLUTE_DIR = path.join(CWD_ABSOLUTE_DIR, "./output");

export const GIT_CLONE_ABSOLUTE_DIR = path.join(OUTPUT_ABSOLUTE_DIR, "./git");
