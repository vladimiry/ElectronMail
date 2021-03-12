import fs from "fs";
import {promisify} from "util";

import {catchTopLeventAsync, resolveGitCommitInfo} from "scripts/lib";
import {CWD_ABSOLUTE_DIR} from "scripts/const";

catchTopLeventAsync(async () => {
    await promisify(fs.writeFile)(
        "./src/electron-main/window/about.json",
        JSON.stringify(await resolveGitCommitInfo({dir: CWD_ABSOLUTE_DIR})),
    );
});
