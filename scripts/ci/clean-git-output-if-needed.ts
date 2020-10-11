import path from "path";

import {CWD, GIT_CLONE_ABSOLUTE_DIR, execShell} from "scripts/lib";
import {RUNTIME_ENV_CI_REMOVE_OUTPUT_GIT_DIR} from "src/shared/constants";

if (
    Number(
        process.env[RUNTIME_ENV_CI_REMOVE_OUTPUT_GIT_DIR]
    ) === 1
) {
    (async () => { // eslint-disable-line @typescript-eslint/no-floating-promises
        await execShell(["npx", ["--no-install", "rimraf", path.resolve(CWD, GIT_CLONE_ABSOLUTE_DIR)]]);
    })();
}
