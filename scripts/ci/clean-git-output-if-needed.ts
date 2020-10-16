import path from "path";

import {CONSOLE_LOG, CWD, GIT_CLONE_ABSOLUTE_DIR, execShell} from "scripts/lib";
import {RUNTIME_ENV_CI_REMOVE_OUTPUT_GIT_DIR} from "src/shared/constants";

if (
    Number(
        process.env[RUNTIME_ENV_CI_REMOVE_OUTPUT_GIT_DIR]
    ) === 1
) {
    (async () => {
        await execShell(["npx", ["--no-install", "rimraf", path.resolve(CWD, GIT_CLONE_ABSOLUTE_DIR)]]);
    })().catch((error) => {
        CONSOLE_LOG(error);
        process.exit(1);
    });
}
