import fastGlob from "fast-glob";
import os from "os";
import packageJSON from "package.json" with {type: "json"};
import path from "path";

import {catchTopLeventAsync, CONSOLE_LOG, execShell} from "scripts/lib";
import {sanitizeFastGlobPattern} from "src/shared/util/sanitize";

const ENV_VAR_NAMES = {
    DEBUG: "DEBUG",
    ELECTRON_MAIL_NODE_DEST_ARCH: "ELECTRON_MAIL_NODE_DEST_ARCH",
    npm_config_arch: "npm_config_arch",
} as const;

const DEST_ARCH = process.env[ENV_VAR_NAMES.ELECTRON_MAIL_NODE_DEST_ARCH] || process.env[ENV_VAR_NAMES.npm_config_arch] || os.arch();

const IS_CROSS_PLATFORM_COMPILATION = DEST_ARCH !== os.arch();

const MSVS_HEADERS_ON_GITHUB_ACTIONS: ReadonlyArray<string> = process.env.GITHUB_ACTIONS && os.platform() === "win32"
    ? [
        "INCLUDE",
        "LIB",
        "LIBPATH",
        "VCINSTALLDIR",
        "VCToolsInstallDir",
        "VCToolsVersion",
        "VSINSTALLDIR",
        "DevEnvDir",
        "UniversalCRTSdkDir",
        "UCRTVersion",
        "WindowsSdkDir",
        "WindowsSDKVersion",
        "WindowsSDKLibVersion",
        "WindowsSdkBinPath",
        "WindowsSdkVerBinPath",
        "WindowsLibPath",
        "NETFXSDKDir",
        "FrameworkDir",
        "FrameworkDir64",
        "FrameworkVersion",
        "Platform",
        "VSCMD_ARG_HOST_ARCH",
        "VSCMD_ARG_TGT_ARCH",
        "VSCMD_VER",
    ].filter((name): name is string => process.env[name] !== undefined)
    : [];

const resolvePlatformEnvVars = ((): () => NodeJS.ProcessEnv => {
    const resolvers: Readonly<Partial<Record<NodeJS.Platform, () => NodeJS.ProcessEnv>>> = {
        win32: () => ({
            GYP_MSVS_VERSION: "2019",
            GYP_DEFINES: "win_target=0x0A00 msvs_runtime_static=true msvs_version=2019",
            CL: "/D_WIN32_WINNT=0x0A00",
        }),
        darwin: () => {
            // https://developer.apple.com/documentation/apple-silicon/building-a-universal-macos-binary
            const versionMin = DEST_ARCH === "x64" ? "10.12" : "11";
            const compilationArch = DEST_ARCH === "x64" ? "x86_64" : DEST_ARCH;
            const flags = `-mmacosx-version-min=${versionMin} -target ${compilationArch}-apple-macos${versionMin}`
                + (IS_CROSS_PLATFORM_COMPILATION ? ` -arch ${DEST_ARCH}` : "");
            return {
                MACOSX_DEPLOYMENT_TARGET: versionMin,
                CFLAGS: flags,
                CXXFLAGS: flags,
                LDFLAGS: flags,
            };
        },
    };
    return () => resolvers[os.platform()]?.() ?? {};
})();

const compileRegularNativeDeps = async (): Promise<void> => {
    const electronRebuildModuleName = "@electron/rebuild";
    const electronRebuildBinaryName = "electron-rebuild";
    const nativeModuleDirs = fastGlob.sync(sanitizeFastGlobPattern("./node_modules/*/binding.gyp")).map((v) => path.dirname(v));

    {
        const expected = ["./node_modules/keytar", "./node_modules/msgpackr-extract"] as const;
        if (JSON.stringify(nativeModuleDirs) !== JSON.stringify(expected)) {
            throw new Error(`Unexpected native modules resolved: ${JSON.stringify({resolved: nativeModuleDirs, expected}, null, 2)}`);
        }
    }

    CONSOLE_LOG(JSON.stringify({nativeModuleDirs}, null, 2));

    for (const moduleDir of nativeModuleDirs) {
        const moduleName = path.basename(moduleDir);
        const baseEnvVars = resolvePlatformEnvVars();
        const extraEnvVars = {
            ...baseEnvVars,
            ...(process.env._MY_GH_CI_NODE_GYP___CC ? {CC: process.env._MY_GH_CI_NODE_GYP___CC} : undefined),
            ...(process.env._MY_GH_CI_NODE_GYP___CXX ? {CXX: process.env._MY_GH_CI_NODE_GYP___CXX} : undefined),
            ...(moduleName === "msgpackr-extract" // "msgpackr-extract" compiling requires C++20
                ? os.platform() === "win32"
                    ? {CL: `${baseEnvVars.CL ?? ""} /FS /Zc:__cplusplus /std:c++20`}
                    : os.platform() === "darwin" || os.platform() === "linux"
                    ? {CXXFLAGS: `${baseEnvVars.CXXFLAGS ?? ""} -std=c++20`, CFLAGS: `${baseEnvVars.CFLAGS ?? ""} -std=c++20`}
                    : undefined
                : undefined),
        };

        await execShell(["npm", [
            "exec",
            "--package",
            electronRebuildModuleName,
            "--",
            electronRebuildBinaryName,
            "--build-from-source",
            "--force",
            `--arch`,
            DEST_ARCH,
            "--version",
            packageJSON.devDependencies.electron,
            "--only",
            moduleName,
            "--module-dir",
            path.join("node_modules", moduleName),
        ], {
            // cwd: moduleDir, // WARN don't set "cwd" to avoid installing/using npx's "electron-rebuild" module version
            env: {
                ...process.env,
                ...extraEnvVars,
                // should enable "--verbose" arg for "node-gyp" call
                // eslint-disable-next-line max-len
                // see https://github.com/electron/electron-rebuild/blob/6f94aaace0ea72a342e9249328293644caec5723/src/module-type/node-gyp.ts#L28
                [ENV_VAR_NAMES.DEBUG]: `${electronRebuildModuleName},${electronRebuildBinaryName},node-gyp`,
            },
        }], {printEnvWhitelist: [...Object.values(ENV_VAR_NAMES), ...Object.keys(extraEnvVars), ...MSVS_HEADERS_ON_GITHUB_ACTIONS]});
    }
};

const bareMakeExec = async (cwd: string, ...args: string[]): Promise<void> => {
    const extraEnvVars = {
        ...resolvePlatformEnvVars(),
        ...(process.env._MY_GH_CI_CLANG___CC ? {CC: process.env._MY_GH_CI_CLANG___CC} : undefined),
        ...(process.env._MY_GH_CI_CLANG___CXX ? {CXX: process.env._MY_GH_CI_CLANG___CXX} : undefined),
    };
    await execShell(
        ["pnpm", ["exec", "bare-make", ...args, "--verbose"], {cwd, env: {...process.env, ...extraEnvVars}}],
        {printEnvWhitelist: [...Object.values(ENV_VAR_NAMES), ...Object.keys(extraEnvVars), ...MSVS_HEADERS_ON_GITHUB_ACTIONS]},
    );
};

const compileSodimuNative = async (): Promise<void> => {
    const cwd = "./node_modules/sodium-native";

    await execShell(["npm", ["install"], {cwd}]);

    await bareMakeExec(cwd, ...["generate", ...(IS_CROSS_PLATFORM_COMPILATION ? ["--arch", DEST_ARCH] : [])]);
    await bareMakeExec(cwd, "build");
    await bareMakeExec(cwd, "install"); // puts built binaries to the "./prebuilds/<platform>-<arch>" directory
};

catchTopLeventAsync(async () => {
    await compileRegularNativeDeps();
    await compileSodimuNative();
});
