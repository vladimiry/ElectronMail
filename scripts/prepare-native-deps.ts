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
        "DevEnvDir",
        "FrameworkDir",
        "FrameworkDir64",
        "FrameworkVersion",
        "INCLUDE",
        "LIB",
        "LIBPATH",
        "NETFXSDKDir",
        "Platform",
        "UCRTVersion",
        "UniversalCRTSdkDir",
        "VCINSTALLDIR",
        "VCToolsInstallDir",
        "VCToolsVersion",
        "VSCMD_ARG_HOST_ARCH",
        "VSCMD_ARG_TGT_ARCH",
        "VSCMD_VER",
        "VSINSTALLDIR",
        "WindowsLibPath",
        "WindowsSdkBinPath",
        "WindowsSdkDir",
        "WindowsSDKLibVersion",
        "WindowsSdkVerBinPath",
        "WindowsSDKVersion",
    ].filter((name): name is string => process.env[name] !== undefined)
    : [];

const ELECTRON_REBUILD_NAMING = {package: "@electron/rebuild", executable: "electron-rebuild"} as const;

const resolvePlatformEnvVars = ((): () => NodeJS.ProcessEnv => {
    const resolvers: Readonly<Partial<Record<NodeJS.Platform, () => NodeJS.ProcessEnv>>> = {
        win32: () => {
            const msvs_version = DEST_ARCH === "x64" ? "2019" : "2022";
            return {
                GYP_MSVS_VERSION: msvs_version,
                GYP_DEFINES: `win_target=0x0A00 msvs_runtime_static=true msvs_version=${msvs_version}`, // # ARM_BUILD_TWEAK
                CL: "/D_WIN32_WINNT=0x0A00",
            };
        },
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

const resolveClangEnvVars = (): NodeJS.ProcessEnv => ({
    ...(process.env._MY_GH_CI_CLANG___CC ? {CC: process.env._MY_GH_CI_CLANG___CC} : undefined),
    ...(process.env._MY_GH_CI_CLANG___CXX ? {CXX: process.env._MY_GH_CI_CLANG___CXX} : undefined),
});

const compileRegularNativeDeps = async (): Promise<void> => {
    const nativeModuleDirs = ((): readonly string[] => {
        const resolved = fastGlob.sync(sanitizeFastGlobPattern("./node_modules/*/binding.gyp")).map((v) => path.dirname(v));
        const expected = ["./node_modules/keytar", "./node_modules/msgpackr-extract"] as const;
        if (JSON.stringify(resolved) !== JSON.stringify(expected)) {
            throw new Error(`Unexpected native modules resolved: ${JSON.stringify({resolved, expected}, null, 2)}`);
        }
        return resolved;
    })();

    CONSOLE_LOG(JSON.stringify({nativeModuleDirs}, null, 2));

    for (const moduleDir of nativeModuleDirs) {
        const moduleName = path.basename(moduleDir);
        const baseEnvVars = resolvePlatformEnvVars();
        const extraEnvVars = {
            ...baseEnvVars,
            ...(moduleName === "msgpackr-extract" // "msgpackr-extract" compiling requires C++20
                ? os.platform() === "win32"
                    ? {CL: `${baseEnvVars.CL ?? ""} /FS /Zc:__cplusplus /std:c++20`}
                    : (
                        os.platform() === "darwin" || os.platform() === "linux"
                            ? {...resolveClangEnvVars(), CXXFLAGS: `${baseEnvVars.CXXFLAGS ?? ""} -std=c++20`}
                            : undefined
                    )
                : undefined),
        };

        await execShell(["npm", [
            "exec",
            "--package",
            ELECTRON_REBUILD_NAMING.package,
            "--",
            ELECTRON_REBUILD_NAMING.executable,
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
            // WARN don't set "cwd" to avoid installing/using npx's "electron-rebuild" module version
            // cwd: moduleDir,
            env: {
                ...process.env,
                ...extraEnvVars,
                // should enable "--verbose" arg for "node-gyp" call
                // eslint-disable-next-line max-len
                // see https://github.com/electron/electron-rebuild/blob/6f94aaace0ea72a342e9249328293644caec5723/src/module-type/node-gyp.ts#L28 eslint-disable-line max-len
                [ENV_VAR_NAMES.DEBUG]: `${ELECTRON_REBUILD_NAMING.package},${ELECTRON_REBUILD_NAMING.executable},node-gyp`,
            },
        }], {
            printEnvWhitelist: [
                ...Object.values(ENV_VAR_NAMES),
                ...Object.keys(extraEnvVars),
                ...MSVS_HEADERS_ON_GITHUB_ACTIONS,
            ],
        });
    }
};

const bareMakeExec = async (cwd: string, ...args: string[]): Promise<void> => {
    const extraEnvVars = {...resolvePlatformEnvVars(), ...resolveClangEnvVars()};
    await execShell(
        ["pnpm", ["exec", "bare-make", ...args, "--verbose"], {cwd, env: {...process.env, ...extraEnvVars}}],
        {
            printEnvWhitelist: [
                ...Object.values(ENV_VAR_NAMES),
                ...Object.keys(extraEnvVars),
                ...MSVS_HEADERS_ON_GITHUB_ACTIONS,
                "LD_LIBRARY_PATH",
            ],
        },
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
