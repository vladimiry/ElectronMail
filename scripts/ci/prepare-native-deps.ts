import fastGlob from "fast-glob";
import fs from "fs";
import os from "os";
import packageJSON from "package.json" assert {type: "json"};
import path from "path";

import {catchTopLeventAsync, CONSOLE_LOG, execShell} from "scripts/lib";
import {sanitizeFastGlobPattern} from "src/shared/util/sanitize";

const compileNativeDeps = async (): Promise<void> => {
    const envVars = {npm_config_arch: "npm_config_arch", PREBUILD_ARCH: "PREBUILD_ARCH"} as const;
    const destArch = process.env[envVars.npm_config_arch] || process.arch;
    const isCrossCompilation = destArch !== process.arch;
    const nativeModuleDirs = (await fastGlob(sanitizeFastGlobPattern("./node_modules/*/binding.gyp")))
        .map((value) => path.dirname(value));

    CONSOLE_LOG(JSON.stringify({nativeModuleDirs}, null, 2));

    for (const moduleDir of nativeModuleDirs) {
        const isSodiumNativeModule = moduleDir.endsWith("/sodium-native");

        // TODO consider using https://github.com/electron/electron-rebuild instead of a raw/direct "node-gyp" call
        try {
            // https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules
            await execShell([
                    "node-gyp" + (os.platform() === "win32" ? ".cmd" : ""),
                    [
                        "rebuild",
                        "--loglevel=verbose",
                        "--build-from-source",
                        "--runtime=electron",
                        `--dist-url=https://electronjs.org/headers`,
                        `--arch=${destArch}`,
                        `--target=${packageJSON.devDependencies.electron}`,
                        // see "HOME=~/.electron-gyp" setting in https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules
                        `--devdir=${path.join(os.homedir(), ".electron-gyp")}`,
                    ],
                    {
                        cwd: moduleDir,
                        env: {
                            ...process.env,
                            // https://developer.apple.com/documentation/apple-silicon/building-a-universal-macos-binary
                            ...(isCrossCompilation && destArch === "arm64" && os.platform() === "darwin" && {
                                CFLAGS: (process.env.CFLAGS ?? "") +
                                    ` -target arm64-apple-macos11 -arch ${destArch}`
                            }),
                            // https://github.com/vladimiry/ElectronMail/issues/357#issuecomment-1184862301
                            ...(isCrossCompilation && isSodiumNativeModule && {[envVars.PREBUILD_ARCH]: destArch}),
                        },
                    },
                ],
                {
                    printEnvWhitelist: [
                        ...Object.values(envVars),
                        ...["MACOSX_DEPLOYMENT_TARGET", "CFLAGS", "HOME"],
                    ],
                },
            );
        } finally {
            if (isSodiumNativeModule) {
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
    await execShell(["pnpm", ["run", "prepare:remove:prebuild-install"]]);
    await execShell(["pnpm", ["run", "clean:prebuilds"]]);
    await compileNativeDeps();
    fs.appendFileSync("electron-builder.yml", os.EOL + "npmRebuild: false");
});
