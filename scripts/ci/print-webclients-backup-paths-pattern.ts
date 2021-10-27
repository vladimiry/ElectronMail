import fastGlob from "fast-glob";
import path from "path";
import {flatten} from "remeda";

import {CONSOLE_LOG, resolveGitOutputBackupDir} from "scripts/lib";
import {CWD_ABSOLUTE_DIR} from "scripts/const";
import {PROVIDER_APP_NAMES} from "src/shared/proton-apps-constants";
import {sanitizeFastGlobPattern} from "src/shared/util";

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

CONSOLE_LOG(result);
