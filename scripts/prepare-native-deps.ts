import fastGlob from "fast-glob";
import fs from "fs";
import os from "os";
import path from "path";

import {catchTopLeventAsync, CONSOLE_LOG, execShell} from "scripts/lib";
import {sanitizeFastGlobPattern} from "src/shared/util/sanitize";

const envVarName = {
    DEBUG: "DEBUG",
    ELECTRON_DEST_MAIL_ARCH: "ELECTRON_DEST_MAIL_ARCH",
    PREBUILD_ARCH: "PREBUILD_ARCH",
    npm_config_arch: "npm_config_arch",
} as const;

const electronRebuildModuleName = "electron-rebuild";

const compileNativeDeps = async (): Promise<void> => {
    const destArch = process.env[envVarName.ELECTRON_DEST_MAIL_ARCH] || process.env[envVarName.npm_config_arch] || process.arch;
    const isCrossCompilation = destArch !== process.arch;
    const nativeModuleDirs = fastGlob.sync(sanitizeFastGlobPattern("./node_modules/*/binding.gyp")).map((v) => path.dirname(v));

    if (nativeModuleDirs.length !== 5) {
        throw new Error("Unexpected native modules count found");
    }

    CONSOLE_LOG(JSON.stringify({nativeModuleDirs}, null, 2));

    for (const moduleDir of nativeModuleDirs) {
        const moduleName = path.basename(moduleDir);
        const isSodiumNativeModule = moduleName === "sodium-native";

        if (moduleName === "lzma-native") {
            continue;
        }

        try {
            await execShell([
                    "npm",
                    [
                        "exec",
                        "--package",
                        electronRebuildModuleName,
                        "--",
                        electronRebuildModuleName,
                        "--force",
                        "--which-module",
                        moduleName,
                        `--arch=${destArch}`,
                    ],
                    {
                        cwd: moduleDir,
                        env: {
                            ...process.env,
                            // should enable "--verbose" arg for "node-gyp" call
                            // eslint-disable-next-line max-len
                            // see https://github.com/electron/electron-rebuild/blob/6f94aaace0ea72a342e9249328293644caec5723/src/module-type/node-gyp.ts#L28
                            [envVarName.DEBUG]: electronRebuildModuleName,
                            // https://developer.apple.com/documentation/apple-silicon/building-a-universal-macos-binary
                            ...(isCrossCompilation && destArch === "arm64" && os.platform() === "darwin" && {
                                CFLAGS: (process.env.CFLAGS ?? "") +
                                    ` -target arm64-apple-macos11 -arch ${destArch}`
                            }),
                            // https://github.com/vladimiry/ElectronMail/issues/357#issuecomment-1184862301
                            ...(isCrossCompilation && isSodiumNativeModule && {[envVarName.PREBUILD_ARCH]: destArch}),
                        },
                    },
                ],
                {
                    printEnvWhitelist: [
                        ...Object.values(envVarName),
                        ...(os.platform() === "darwin" ? ["MACOSX_DEPLOYMENT_TARGET", "CFLAGS"] : []),
                    ],
                },
            );
        } finally {
            if (process.env.CI && isSodiumNativeModule) {
                for (const file of await fastGlob([
                    sanitizeFastGlobPattern(path.join(moduleDir, "*-deps-cmd-out.log")),
                    sanitizeFastGlobPattern(path.join(moduleDir, "deps/**/*/config.log")),
                ])) {
                    const content = fs.readFileSync(file).toString();
                    if (content) CONSOLE_LOG(`${path.basename(file)}: deps/bin.js ${file.includes("-err-") ? "ERR" : "OUT"}: ` + content);
                    fs.unlinkSync(file);
                }
            }
        }
    }
};

catchTopLeventAsync(async () => {
    await compileNativeDeps();
});
