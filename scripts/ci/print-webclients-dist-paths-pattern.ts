import path from "path";
import {sync as fastGlobSync} from "fast-glob";
import {flatten} from "remeda";

import {CONSOLE_LOG, CWD, GIT_CLONE_ABSOLUTE_DIR} from "scripts/lib";
import {PROVIDER_REPO_NAMES} from "src/shared/constants";
import {sanitizeFastGlobPattern} from "src/shared/util";

const delimiter = ";";

const result: string = flatten(
    PROVIDER_REPO_NAMES.map((repoType) => {
        return fastGlobSync(
            sanitizeFastGlobPattern(
                path.join(
                    GIT_CLONE_ABSOLUTE_DIR,
                    "./backup",
                    repoType,
                    [
                        "*", // commit mask
                        "-",
                        "*" // "dir name as domain" mask
                    ].join(""),
                ),
            ),
            {
                deep: 1,
                onlyDirectories: true,
                stats: false,
            },
        ).map((item) => {
            return path.relative(CWD, item);
        });
    }),
).join(delimiter);

CONSOLE_LOG(result);
