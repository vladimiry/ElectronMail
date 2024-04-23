import _fetch from "electron-fetch";
import byline from "byline";
import {createHash} from "crypto";
import fs from "fs";
import fsExtra from "fs-extra";
import {omit, pick} from "remeda";
import os from "os";
import path from "path";
import pathIsInside from "path-is-inside";
import {promisify} from "util";
import spawnAsync from "@expo/spawn-async";
import {URL} from "@cliqz/url-parser";

import {CWD_ABSOLUTE_DIR, GIT_CLONE_ABSOLUTE_DIR, OUTPUT_ABSOLUTE_DIR} from "./const";
import {PROVIDER_REPO_MAP} from "src/shared/const/proton-apps";

export const assertPathIsInCwd = (value: string): void => {
    if (!pathIsInside(value, CWD_ABSOLUTE_DIR)) {
        throw new Error(`Path "${value}" is not inside "${CWD_ABSOLUTE_DIR}"`);
    }
};

// TODO make "./scripts/electron-builder/hooks/afterPack/index.cjs" execution in ESM mode same as the other scripts
const fetch = typeof _fetch === "function"
    ? _fetch
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    : (_fetch as any).default as typeof _fetch;
if (typeof fetch !== "function") {
    throw new Error(`Unexpected "${nameof(fetch)}" type: ${typeof fetch}`);
}

export const makeConsoleTextYellow = (value: string): string => {
    return /*reset:*/ "\x1b[0m" + /*yellow:*/ "\x1b[33m" + value + /*reset:*/ "\x1b[0m";
};

export const CONSOLE_LOG: typeof console.log = (...args) => {
    return console.log( // eslint-disable-line no-console
        makeConsoleTextYellow(">>>"),
        ...args,
    );
};

export function resolveGitOutputBackupDir(
    {repoType, tag = PROVIDER_REPO_MAP[repoType].tag, suffix}: {repoType: keyof typeof PROVIDER_REPO_MAP; tag?: string; suffix?: string},
): string {
    return path.join(GIT_CLONE_ABSOLUTE_DIR, "./backup", repoType, `./${tag}${suffix ? ("-" + suffix) : ""}`);
}

export function formatStreamChunk( // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
    chunk: any, // eslint-disable-line @typescript-eslint/no-explicit-any
): string {
    return Buffer.from(
        chunk, // eslint-disable-line @typescript-eslint/no-unsafe-argument
        "utf-8",
    ).toString();
}

export async function execShell(
    [command, args, options]: Parameters<typeof spawnAsync>,
    {printStdOut = true, printStdErr = true, printEnvWhitelist = [], doNotRethrow = false, doNotDropNodeOptionsRelatedEnvVars = false}: {
        printStdOut?: boolean;
        printStdErr?: boolean;
        printEnvWhitelist?: readonly string[];
        doNotRethrow?: boolean;
        doNotDropNodeOptionsRelatedEnvVars?: boolean;
    } = {},
): Promise<Unpacked<ReturnType<typeof spawnAsync>>> {
    {
        const stringifiedOptions = JSON.stringify({
            ...(options && omit(options, ["env"])),
            ...{
                whitelistedEnv: options?.env && printEnvWhitelist?.length
                    ? pick(options.env, [...printEnvWhitelist])
                    : undefined,
            },
        });
        const optionsPart = stringifiedOptions !== "{}"
            ? ` (options: ${stringifiedOptions})`
            : "";
        CONSOLE_LOG(`Executing Shell command${optionsPart}: ${makeConsoleTextYellow([command, ...(args ?? [])].join(" "))}`);
    }

    const spawnPromise = spawnAsync(command, args, {
        ...options,
        env: {
            ...process.env,
            ...options?.env,
            ...(!doNotDropNodeOptionsRelatedEnvVars && { // disable node options inheritance form the parent/own process
                NODE_OPTIONS: "",
                npm_config_node_options: "",
            }),
        },
    });
    const {stdout, stderr} = spawnPromise.child;
    const print = (std: import("stream").Readable): void => {
        byline(std).on("data", (chunk) => {
            console.log( // eslint-disable-line no-console
                formatStreamChunk(chunk),
            );
        });
    };

    if (printStdOut && stdout) {
        print(stdout);
    }
    if (printStdErr && stderr) {
        print(stderr);
    }

    try {
        return await spawnPromise;
    } catch (_) {
        const error = _ as Unpacked<ReturnType<typeof spawnAsync>>;
        if (doNotRethrow) {
            return error;
        }
        (() => {
            const omitProps: Array<keyof typeof error> = ["output", "stderr", "stdout"];
            omitProps.forEach((omitProp) => {
                if (omitProp in error) {
                    delete error[omitProp]; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
                }
            });
        })();
        throw error;
    }
}

export async function fetchUrl(...[url, options]: Parameters<typeof fetch>): ReturnType<typeof fetch> {
    CONSOLE_LOG(`Downloading ${String(url)}`);
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`Downloading failed: ${JSON.stringify(pick(response, ["status", "statusText"]))}`);
    }
    return response;
}

export async function resolveGitCommitInfo({dir}: {dir: string}): Promise<{shortCommit: string; commit: string}> {
    return (await Promise.all(
        ([{prop: "shortCommit", gitArgs: ["rev-parse", "--short", "HEAD"]}, {prop: "commit", gitArgs: ["rev-parse", "HEAD"]}] as const).map(
            async ({gitArgs, prop}) =>
                execShell(["git", gitArgs, {cwd: dir}]).then(({stdout}) => ({value: stdout.replace(/(\r\n|\n|\r)/gm, ""), gitArgs, prop})),
        ),
    )).reduce((accumulator: NoExtraProps<Record<typeof prop, string>>, {value, gitArgs, prop}) => {
        if (!value) {
            throw new Error(`"${JSON.stringify(gitArgs)}" git command returned empty value: ${value}`);
        }
        return {...accumulator, [prop]: value};
    }, {shortCommit: "", commit: ""});
}

export const calculateHash = async (filePath: string, algorithm = "sha256"): Promise<{hash: string; type: typeof algorithm}> => {
    return new Promise((resolve, reject) => {
        const hash = createHash(algorithm);

        fs.createReadStream(filePath).on("data", (data) => hash.update(data)).on(
            "end",
            () => resolve({hash: hash.digest("hex"), type: algorithm}),
        ).on("error", reject);
    });
};

export const resolveExecutable = async (url: string, sha256: string, subdirectory: string): Promise<{command: string}> => {
    const destFile = path.join(
        OUTPUT_ABSOLUTE_DIR,
        "./executables",
        subdirectory,
        (() => {
            const fileName = new URL(url).pathname.split("/").pop();
            if (!fileName) {
                throw new Error(`Failed to parse executable file name from the "${url}"`);
            }
            return fileName;
        })(),
    );
    const calculateHashes = async (): Promise<{actual: string; expected: string; equal: boolean}> => {
        const actual = (await calculateHash(destFile)).hash;
        const expected = sha256;
        const result = {actual, expected, equal: actual === expected} as const;
        CONSOLE_LOG(`Calculated "${destFile}" checksum: ${JSON.stringify(result)}`);
        return result;
    };

    if (
        !await fsExtra.pathExists(destFile)
        || !(await calculateHashes()).equal
    ) {
        const response = await fetchUrl(url);
        fsExtra.ensureDirSync(path.dirname(destFile));
        await promisify(fs.writeFile)(destFile, await response.buffer());
    }

    {
        const hashes = await calculateHashes();
        if (!hashes.equal) {
            throw new Error(`Hashes verification failed: ${JSON.stringify(hashes)}`);
        }
    }

    if (os.platform() !== "win32") {
        await execShell(["chmod", ["+x", destFile]]);
    }

    return {command: destFile};
};

export const catchTopLeventAsync = (asyncFn: () => Promise<unknown>): void => {
    (async () => {
        await asyncFn();
    })().catch((error) => {
        CONSOLE_LOG(error);
        process.exit(1);
    });
};

export const applyPatch = async ({patchFile, cwd}: {patchFile: string; cwd: string}): Promise<void> => {
    await execShell(["git", ["apply", "--ignore-whitespace", "--reject", patchFile], {cwd}]);
};
