// TODO drop "scripts/typescript-upgrade.ts" after typescript gets updated to the 4.6.x version
//      see https://github.com/microsoft/TypeScript/pull/46818

import {catchTopLeventAsync, execShell} from "scripts/lib";

const [, , ACTION_TYPE_ARG] = process.argv as [null, null, "upgrade" | "rollback" | unknown];

catchTopLeventAsync(async () => {
    if (ACTION_TYPE_ARG === "upgrade") {
        await execShell(["yarn", ["add", "--dev", "typescript@4.6.0-dev.20211210"]]);
        return;
    }
    if (ACTION_TYPE_ARG === "rollback") {
        await execShell(["yarn", ["add", "--dev", "typescript@4.6.3"]]);
        return;
    }
    throw new Error(`Unexpected action type argument: ${String(ACTION_TYPE_ARG)}`);
});
