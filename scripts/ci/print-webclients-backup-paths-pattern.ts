import fastGlob from "fast-glob";
import {flatten} from "remeda";
import path from "path";

import {CWD_ABSOLUTE_DIR} from "scripts/const";
import {PROVIDER_APP_NAMES} from "src/shared/const/proton-apps";
import {resolveGitOutputBackupDir} from "scripts/lib";
import {sanitizeFastGlobPattern} from "src/shared/util/sanitize";

const {sync: fastGlobSync} = fastGlob;

const delimiter = ";";

const result: string = flatten(
    PROVIDER_APP_NAMES.map((repoType) => {
        return fastGlobSync(
            sanitizeFastGlobPattern(
                resolveGitOutputBackupDir({repoType, tag: "*", suffix: "*"}),
            ),
            {
                deep: 1,
                onlyDirectories: true,
                stats: false,
            },
        ).map((item) => {
            return path.relative(CWD_ABSOLUTE_DIR, item);
        });
    }),
).join(delimiter);

// WARN a "clean" output is required, so the CONSOLE_LOG is not used here
console.log(result); // eslint-disable-line no-console
