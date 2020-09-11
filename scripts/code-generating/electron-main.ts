import fs from "fs";
import {promisify} from "util";

import {execShell, LOG} from "scripts/lib";

(async () => {
    const destFile = "./src/electron-main/window/about.json";

    await promisify(fs.writeFile)(
        destFile,
        JSON.stringify(
            (
                await Promise.all(
                    (
                        [
                            {prop: "branch", gitArgs: ["branch", "--show-current"]},
                            {prop: "commitShort", gitArgs: ["rev-parse", "--short", "HEAD"]},
                            {prop: "commit", gitArgs: ["rev-parse", "HEAD"]},
                        ] as const
                    ).map(
                        ({gitArgs, prop}) => execShell(["git", gitArgs])
                            .then(({stdout}) => ({value: stdout.replace(/(\r\n|\n|\r)/gm, ""), gitArgs, prop})),
                    ),
                )
            ).reduce(
                (accumulator: NoExtraProperties<Record<typeof prop, string>>, {value, gitArgs, prop}) => {
                    if (!value) {
                        throw new Error(`"${gitArgs}" git command returned empty value: ${value}`);
                    }
                    return {...accumulator, [prop]: value};
                },
                {branch: "", commitShort: "", commit: ""},
            )
        ),
    );
})().catch((error) => {
    LOG(error);
    process.exit(1);
});
