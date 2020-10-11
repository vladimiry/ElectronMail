import {ARTIFACT_NAME_POSTFIX_ENV_VAR_NAME} from "scripts/const";
import {execShell} from "scripts/lib";

// https://nodejs.org/en/knowledge/command-line/how-to-parse-command-line-arguments/
const [
    /* node binary */,
    /* script file */,
    ...args
] = process.argv;

(async () => { // eslint-disable-line @typescript-eslint/no-floating-promises
    await execShell([
        "npx",
        ["electron-builder", ...args],
        {
            env: {
                ...process.env,
                [ARTIFACT_NAME_POSTFIX_ENV_VAR_NAME]: process.env[ARTIFACT_NAME_POSTFIX_ENV_VAR_NAME] ?? "",
            },
        },
    ]);
})();
