import path from "path";
import {Packager} from "app-builder-lib";

import {execShell} from "scripts/lib";

const afterPack: Packager["afterPack"] = async (context) => {
    if (context.electronPlatformName !== "linux") {
        return;
    }

    // TODO read "dist" folder from electron-builder.yml (see directories.output value)
    const chromeSandboxBinary = path.resolve("./dist/linux-unpacked/chrome-sandbox");

    await execShell(["chmod", ["4755", chromeSandboxBinary]]);
};

export default afterPack;
