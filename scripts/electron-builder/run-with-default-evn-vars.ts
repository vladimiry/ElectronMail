import {ARTIFACT_NAME_POSTFIX_ENV_VAR_NAME} from "scripts/const";
import {catchTopLeventAsync, execShell} from "scripts/lib";

// https://nodejs.org/en/knowledge/command-line/how-to-parse-command-line-arguments/
const [
    /* node binary */,
    /* script file */,
    ...args
] = process.argv;

catchTopLeventAsync(async () => {
    await execShell(
        [
            "npm",
            [
                "exec", "--package=electron-builder", "--", "electron-builder",
                ...args,
            ],
            {
                env: {
                    ...process.env,
                    [ARTIFACT_NAME_POSTFIX_ENV_VAR_NAME]: process.env[ARTIFACT_NAME_POSTFIX_ENV_VAR_NAME] ?? "",
                },
            },
        ],
        {printEnvWhitelist: [ARTIFACT_NAME_POSTFIX_ENV_VAR_NAME]},
    );
});
