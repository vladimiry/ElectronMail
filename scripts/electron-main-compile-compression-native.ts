import os from "os";

import {catchTopLeventAsync, execShell} from "scripts/lib";

catchTopLeventAsync(async () => {
    const rustFlagsEnvVarName = "RUSTFLAGS";

    await execShell([
        "pnpm",
        [
            ...`run --filter compression-native build`.split(" "),
        ],
        ...(
            os.platform() === "darwin"
                ? [{env: {...process.env, [rustFlagsEnvVarName]: "-C link-args=-Wl,-undefined,dynamic_lookup"}}] as const
                : [] as const
        )
    ], {printEnvWhitelist: [rustFlagsEnvVarName]});
});
