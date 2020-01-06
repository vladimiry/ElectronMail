import path from "path";

import {LOG} from "scripts/lib";
import {PROVIDER_REPOS} from "src/shared/constants";

const delimiter = ";";

LOG(
    (["WebClient", "proton-mail-settings", "proton-contacts", "proton-calendar"] as const)
        .map((repo) => {
            return `./output/git/${repo}/${PROVIDER_REPOS[repo].commit}/*/${path.normalize(PROVIDER_REPOS[repo].repoRelativeDistDir)}`;
        })
        .join(delimiter),
);
