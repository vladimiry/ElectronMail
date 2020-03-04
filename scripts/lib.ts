import byline from "byline";
import chalk from "chalk";
import fetch from "node-fetch";
import path from "path";
import spawnAsync from "@expo/spawn-async";
import {pick} from "remeda";

import {ARTIFACT_NAME_POSTFIX_ENV_VAR_NAME} from "scripts/const";
import {PROVIDER_REPOS} from "src/shared/constants";

export const CWD = path.resolve(process.cwd());

// tslint:disable-next-line:no-console
export const LOG = console.log;

export const LOG_LEVELS = {
    error: chalk.red,
    warning: chalk.yellow,
    title: chalk.magenta,
    value: chalk.cyan,
};

const execShellPrintEnvWhitelist: ReadonlyArray<string> = [
    ARTIFACT_NAME_POSTFIX_ENV_VAR_NAME,
    ...(() => {
        const stub: Record<keyof Required<(typeof PROVIDER_REPOS)[keyof typeof PROVIDER_REPOS]["i18nEnvVars"]>, null> = {
            I18N_DEPENDENCY_REPO: null,
            I18N_DEPENDENCY_BRANCH: null,
            I18N_DEPENDENCY_BRANCH_V4: null,
        };
        return Object.keys(stub);
    })(),
] as const;

export async function execShell(
    [command, args, options]: Parameters<typeof spawnAsync>,
    {
        printStd = true,
        printEnvWhitelist = execShellPrintEnvWhitelist,
    }: {
        printStd?: boolean;
        printEnvWhitelist?: readonly string[];
    } = {},
): Promise<Unpacked<ReturnType<typeof spawnAsync>>> {
    LOG(
        LOG_LEVELS.title("Executing Shell command:"),
        LOG_LEVELS.value(
            JSON.stringify(
                {
                    command,
                    args,
                    options: {
                        ...options,
                        env: pick(options?.env ?? {}, [...printEnvWhitelist]),
                    },
                },
                null,
                2,
            ),
        ),
    );

    const spawnPromise = spawnAsync(command, args, options);

    if (printStd) {
        const {stdout, stderr} = spawnPromise.child;

        if (stdout) {
            byline(stdout).on("data", (chunk) => {
                LOG(chalk(formatStreamChunk(chunk)));
            });
        }

        if (stderr) {
            byline(stderr).on("data", (chunk) => {
                LOG(chalk(formatStreamChunk(chunk)));
            });
        }
    }

    try {
        return await spawnPromise;
    } catch (error) {
        const omitProps: Array<keyof Unpacked<ReturnType<typeof spawnAsync>>> = ["output", "stderr", "stdout"];
        omitProps.forEach((omitProp) => delete error[omitProp]);
        throw error;
    }
}

export function formatStreamChunk(chunk: any): string {
    return Buffer.from(chunk, "utf-8").toString();
}

export async function fetchUrl(args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
    const [request] = args;
    const url = typeof request === "string"
        ? request
        : "url" in request
            ? request.url
            : request.href;

    LOG(LOG_LEVELS.title(`Downloading ${LOG_LEVELS.value(url)}`));

    const response = await fetch(...args);

    if (!response.ok) {
        throw new Error(`Downloading failed: ${JSON.stringify(pick(response, ["status", "statusText"]))}`);
    }

    return response;
}
