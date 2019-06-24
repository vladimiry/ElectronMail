import fastGlob from "fast-glob";

import {LOG, execShell} from "scripts/lib";

const [, , ...args] = process.argv as string[];

const filesGlobArgCount = 2;
const filesGlobArgName = "--filesGlob";
const filesGlobArgIndex = args.indexOf(filesGlobArgName);

if (filesGlobArgIndex === -1) {
    throw new Error(`"${filesGlobArgName}" CLI argument has not been passed`);
}
if ((args.length - filesGlobArgIndex) < filesGlobArgCount) {
    throw new Error(`"${filesGlobArgName}" CLI argument value has not been defined`);
}

const filesGlobArgValue = args[filesGlobArgIndex + 1];

args.splice(filesGlobArgIndex, filesGlobArgCount);

(async () => {
    const files = await fastGlob(
        filesGlobArgValue.replace(/\\/g, "/"),
        {
            absolute: false,
            onlyFiles: true,
            stats: false,
        },
    );

    await execShell(["npx", ["ava", ...args, ...files]]);
})().catch((error) => {
    LOG(error);
    process.exit(1);
});
