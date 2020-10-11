import byline from "byline";
import fetch from "node-fetch";
import path from "path";
import spawnAsync from "@expo/spawn-async";
import {pick} from "remeda";

export const CWD = path.resolve(process.cwd());

// eslint-disable-next-line no-console
export const CONSOLE_LOG = console.log.bind(console);

export const GIT_CLONE_ABSOLUTE_DIR = path.resolve(CWD, "./output/git");

export function formatStreamChunk( // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
    chunk: any, // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
): string {
    return Buffer.from(chunk, "utf-8").toString();
}

export async function execShell(
    [command, args, options]: Parameters<typeof spawnAsync>,
    {
        printStd = true,
        printEnvWhitelist = [],
    }: {
        printStd?: boolean;
        printEnvWhitelist?: readonly string[];
    } = {},
): Promise<Unpacked<ReturnType<typeof spawnAsync>>> {
    CONSOLE_LOG(
        "Executing Shell command:",
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
    );

    const spawnPromise = spawnAsync(command, args, options);

    if (printStd) {
        const {stdout, stderr} = spawnPromise.child;
        if (stdout) {
            byline(stdout).on("data", (chunk) => CONSOLE_LOG(formatStreamChunk(chunk)));
        }
        if (stderr) {
            byline(stderr).on("data", (chunk) => formatStreamChunk(chunk));
        }
    }

    try {
        return await spawnPromise;
    } catch (error) {
        (() => {
            const omitProps: Array<keyof Unpacked<ReturnType<typeof spawnAsync>>> = ["output", "stderr", "stdout"];
            omitProps.forEach((omitProp) => {
                if (omitProp in error) {
                    delete error[omitProp]; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
                }
            });
        })();
        throw error;
    }
}

export async function fetchUrl(args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
    const [request] = args;
    const url = typeof request === "string"
        ? request
        : "url" in request
            ? request.url
            : request.href;

    CONSOLE_LOG(`Downloading ${url}`);

    const response = await fetch(...args);

    if (!response.ok) {
        throw new Error(`Downloading failed: ${JSON.stringify(pick(response, ["status", "statusText"]))}`);
    }

    return response;
}

export async function resolveGitCommitInfo(
    {dir}: { dir: string },
): Promise<{ shortCommit: string, commit: string }> {
    return (
        await Promise.all(
            (
                [
                    {prop: "shortCommit", gitArgs: ["rev-parse", "--short", "HEAD"]},
                    {prop: "commit", gitArgs: ["rev-parse", "HEAD"]},
                ] as const
            ).map(
                async ({gitArgs, prop}) => execShell(["git", gitArgs, {cwd: dir}])
                    .then(({stdout}) => ({value: stdout.replace(/(\r\n|\n|\r)/gm, ""), gitArgs, prop})),
            ),
        )
    ).reduce(
        (accumulator: NoExtraProps<Record<typeof prop, string>>, {value, gitArgs, prop}) => {
            if (!value) {
                throw new Error(`"${JSON.stringify(gitArgs)}" git command returned empty value: ${value}`);
            }
            return {...accumulator, [prop]: value};
        },
        {shortCommit: "", commit: ""},
    );
}
