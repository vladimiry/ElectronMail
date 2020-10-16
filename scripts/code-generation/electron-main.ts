import fs from "fs";
import {promisify} from "util";

import {CONSOLE_LOG, CWD, resolveGitCommitInfo} from "scripts/lib";

(async () => {
    await promisify(fs.writeFile)(
        "./src/electron-main/window/about.json",
        JSON.stringify(await resolveGitCommitInfo({dir: CWD})),
    );
})().catch((error) => {
    CONSOLE_LOG(error);
    process.exit(1);
});
