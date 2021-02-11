import path from "path";
import {sync as fastGlobSync} from "fast-glob";
import {flatten} from "remeda";

import {CONSOLE_LOG, resolveGitOutputBackupDir} from "scripts/lib";
import {CWD_ABSOLUTE_DIR} from "scripts/const";
import {PROVIDER_REPO_NAMES} from "src/shared/proton-apps-constants";
import {sanitizeFastGlobPattern} from "src/shared/util";

const delimiter = ";";

const result: string = flatten(
    PROVIDER_REPO_NAMES.map((repoType) => {
        return fastGlobSync(
            sanitizeFastGlobPattern(
                resolveGitOutputBackupDir({repoType, commit: "*", suffix: "*"}),
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
