import {ARTIFACT_NAME_POSTFIX_ENV_VAR_NAME} from "scripts/const";
import {CONSOLE_LOG, execShell} from "scripts/lib";

// https://nodejs.org/en/knowledge/command-line/how-to-parse-command-line-arguments/
const [
    /* node binary */,
    /* script file */,
    ...args
] = process.argv;

(async () => {
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
})().catch((error) => {
    CONSOLE_LOG(error);
    process.exit(1);
});
