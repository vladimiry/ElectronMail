import fs from "fs";
import {promisify} from "util";

import {CWD, resolveGitCommitInfo} from "scripts/lib";

(async () => { // eslint-disable-line @typescript-eslint/no-floating-promises
    await promisify(fs.writeFile)(
        "./src/electron-main/window/about.json",
        JSON.stringify(await resolveGitCommitInfo({dir: CWD})),
    );
})();
