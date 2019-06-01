import fastGlob from "fast-glob";
import fs from "fs";
import fsExtra from "fs-extra";
import mkdirp from "mkdirp";
import path from "path";
import {Packager, PackagerOptions, Platform} from "app-builder-lib";
import {getConfig} from "app-builder-lib/out/util/config";

import {LOG, LOG_LEVELS, PROC_CWD, execShell} from "scripts/lib";
import {Unpacked} from "src/shared/types";
import {normalizeLocale} from "src/shared/util";

// tslint:disable-next-line:no-floating-promises
(async () => {
    const configFile = path.join(PROC_CWD, "./electron-builder.yml");
    const config = await getConfig(PROC_CWD, configFile, null);
    const packagerOptions: PackagerOptions = {
        targets: Platform.LINUX.createTarget("snap"),
        config,
    };
    const packager = new Packager(packagerOptions);
    const {artifactPaths: [snapFile]} = await packager.build();

    await postProcessSnapPackage(snapFile);
})();

async function postProcessSnapPackage(snapFile: string) {
    if (!snapFile || !snapFile.endsWith(".snap")) {
        throw new Error(`Invalid snap artifact: "${snapFile}"`);
    }

    const unSquashedSnapDir = `${snapFile}-squashfs-root-${Date.now()}`;
    const unSquashedSnapHunspellDir = path.join(unSquashedSnapDir, "./usr/share/hunspell");
    const {files: dictionaryFiles} = await prepareDictionaries();

    await execShell(["unsquashfs", ["-dest", unSquashedSnapDir, "-processors", "1", snapFile]]);

    LOG(LOG_LEVELS.title(`Copying ${dictionaryFiles.length} dictionary files to ${LOG_LEVELS.value(unSquashedSnapHunspellDir)} directory`));
    mkdirp.sync(unSquashedSnapHunspellDir);
    for (const dictionaryFile of dictionaryFiles) {
        fs.copyFileSync(
            dictionaryFile,
            path.join(unSquashedSnapHunspellDir, path.basename(dictionaryFile)),
        );
    }

    await execShell(["mv", ["--force", snapFile, `${snapFile}.bak`]]);
    await execShell(["snapcraft", ["pack", unSquashedSnapDir, "--output", snapFile]]);
}

async function prepareDictionaries(): Promise<{ files: string[] }> {
    const outcomeDir = path.join(PROC_CWD, "./output/git-wooorm-dictionaries-outcome");
    const result: { files: string[] } = {files: []};

    if (fsExtra.pathExistsSync(outcomeDir)) {
        const files = await fastGlob.async<string>(
            path.join(outcomeDir, "./*"),
            {
                absolute: true,
                deep: 1,
                onlyFiles: true,
                stats: false,
            },
        );
        if (files.length) {
            result.files.push(...files);
        }
    }

    if (!result.files.length) {
        const repoCwd = path.join(PROC_CWD, "./output/git-wooorm-dictionaries");

        if (!fsExtra.pathExistsSync(repoCwd)) {
            await execShell(["git", ["clone", "https://github.com/wooorm/dictionaries.git", repoCwd]]);
            await execShell(["git", ["checkout", "44f122685cbcb52008a34abadc417149e31134f2"], {cwd: repoCwd}]);
            await execShell(["git", ["show", "--summary"], {cwd: repoCwd}]);
        }

        const resolvedDictionaries: Array<{ locale: string, aff: string; dic: string; license?: string; }> = [];
        const localeDirs = await fastGlob.async<string>(
            path.join(repoCwd, "./dictionaries/*"),
            {
                absolute: true,
                deep: 1,
                onlyDirectories: true,
                stats: false,
            },
        );

        for (const localeDir of localeDirs) {
            const locale = normalizeLocale(
                path.basename(localeDir),
            );

            if (String(locale.split("_").pop()).length > 2) {
                LOG(LOG_LEVELS.warning(`Skipping "${LOG_LEVELS.value(locale)}" locale`));
                continue;
            }

            const license = path.join(localeDir, "./license");

            resolvedDictionaries.push({
                locale,
                aff: path.join(localeDir, "./index.aff"),
                dic: path.join(localeDir, "./index.dic"),
                license: fsExtra.pathExistsSync(license)
                    ? license
                    : undefined,
            });
        }

        mkdirp.sync(outcomeDir);

        for (const {locale, aff, dic, license} of resolvedDictionaries) {
            const dest: Unpacked<typeof resolvedDictionaries> & { license: string } = {
                locale,
                aff: path.join(outcomeDir, `./${locale}.aff`),
                dic: path.join(outcomeDir, `./${locale}.dic`),
                license: path.join(outcomeDir, `./${locale}.license`),
            };

            fs.copyFileSync(aff, dest.aff);
            result.files.push(dest.aff);

            fs.copyFileSync(dic, dest.dic);
            result.files.push(dest.dic);

            if (license) {
                fs.copyFileSync(license, dest.license);
                result.files.push(dest.license);
            }
        }
    }

    LOG(LOG_LEVELS.title(`Prepared dictionary files: ${LOG_LEVELS.value(JSON.stringify(result.files, null, 2))}`));

    return result;
}
