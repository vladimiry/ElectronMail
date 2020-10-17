import fs from "fs";
import {promisify} from "util";

import {CONSOLE_LOG, resolveGitCommitInfo} from "scripts/lib";
import {CWD_ABSOLUTE_DIR} from "scripts/const";

(async () => {
    await promisify(fs.writeFile)(
        "./src/electron-main/window/about.json",
        JSON.stringify(await resolveGitCommitInfo({dir: CWD_ABSOLUTE_DIR})),
    );
})().catch((error) => {
    CONSOLE_LOG(error);
    process.exit(1);
});
