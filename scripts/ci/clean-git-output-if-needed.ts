import path from "path";

import {CONSOLE_LOG, execShell} from "scripts/lib";
import {CWD_ABSOLUTE_DIR, GIT_CLONE_ABSOLUTE_DIR} from "scripts/const";
import {RUNTIME_ENV_CI_REMOVE_OUTPUT_GIT_DIR} from "src/shared/constants";

if (
    Number(
        process.env[RUNTIME_ENV_CI_REMOVE_OUTPUT_GIT_DIR]
    ) === 1
) {
    (async () => {
        await execShell(["npx", ["--no-install", "rimraf", path.resolve(CWD_ABSOLUTE_DIR, GIT_CLONE_ABSOLUTE_DIR)]]);
    })().catch((error) => {
        CONSOLE_LOG(error);
        process.exit(1);
    });
}
