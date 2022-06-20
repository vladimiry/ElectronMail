import fastGlob from "fast-glob";
import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";

import {CONSOLE_LOG, execShell} from "scripts/lib";
import {GIT_CLONE_ABSOLUTE_DIR} from "scripts/const";
import {Locale} from "src/shared/model/common";
import {normalizeLocale, sanitizeFastGlobPattern} from "src/shared/util/sanitize";

interface Dictionary {
    locale: Locale;
    files: string[];
}

// "--disable-setuid-sandbox" prevents falling back to SUID sandbox
export const DISABLE_SANDBOX_ARGS_LINE = "--no-sandbox";

export function ensureFileHasNoSuidBit(file: string): void {
    const stat = fs.statSync(file);

    if (!stat.isFile()) {
        throw new Error(`"${file}" is not a file`);
    }

    const hasSuidBit = Boolean(
        // tslint:disable-next-line:no-bitwise
        stat.mode
        &
        // first bit of 12, same as 0b100000000000 binary or 2048 decimal
        0x800,
    );

    if (hasSuidBit) {
        throw new Error(`"${file}" should not have SUID bit set`);
    }
}

async function prepareDictionaries(): Promise<Map<Locale, Dictionary>> {
    const outcomeDir = path.join(GIT_CLONE_ABSOLUTE_DIR, "./git-wooorm-dictionaries-outcome");
    const files: string[] = [];

    if (fsExtra.pathExistsSync(outcomeDir)) {
        const existingFiles = await fastGlob(
            sanitizeFastGlobPattern(
                path.join(outcomeDir, "./*"),
            ),
            {
                absolute: true,
                deep: 1,
                onlyFiles: true,
                stats: false,
            },
        );
        if (existingFiles.length) {
            files.push(...existingFiles);
        }
    }

    if (!files.length) {
        const repoCwd = path.join(GIT_CLONE_ABSOLUTE_DIR, "./git-wooorm-dictionaries");

        if (!fsExtra.pathExistsSync(repoCwd)) {
            await execShell(["git", ["clone", "https://github.com/wooorm/dictionaries.git", repoCwd]]);
            await execShell(["git", ["checkout", "5fbbffcfa55acdcdeed53787edcbf4e5b69a86fd"], {cwd: repoCwd}]);
            await execShell(["git", ["show", "--summary"], {cwd: repoCwd}]);
        }

        const resolvedDictionaries: Array<{ locale: string; aff: string; dic: string; license?: string }> = [];
        const localeDirs = await fastGlob(
            sanitizeFastGlobPattern(
                path.join(repoCwd, "./dictionaries/*"),
            ),
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
                CONSOLE_LOG(`Skipping ${locale} dictionary`);
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

        fsExtra.ensureDirSync(outcomeDir);

        for (const {locale, aff, dic, license} of resolvedDictionaries) {
            const dest: Unpacked<typeof resolvedDictionaries> & { license: string } = {
                locale,
                aff: path.join(outcomeDir, `./${locale}.aff`),
                dic: path.join(outcomeDir, `./${locale}.dic`),
                license: path.join(outcomeDir, `./${locale}.license`),
            };

            fs.copyFileSync(aff, dest.aff);
            files.push(dest.aff);

            fs.copyFileSync(dic, dest.dic);
            files.push(dest.dic);

            if (license) {
                fs.copyFileSync(license, dest.license);
                files.push(dest.license);
            }
        }
    }

    const result = new Map<Locale, Dictionary>();

    for (const file of files) {
        const locale: Locale = path.basename(file, path.extname(file));
        const dictionary: Dictionary = (
            result.get(locale)
            ||
            (() => {
                const newDictionary = {locale, files: []};
                result.set(locale, newDictionary);
                return newDictionary;
            })()
        );

        dictionary.files.push(file);
    }

    CONSOLE_LOG(`Prepared ${String(files.length)} dictionary files of ${String(result.size)} locales.`);

    return result;
}

export async function copyDictionaryFilesTo(destDir: string): Promise<void> {
    const dictionaries = await prepareDictionaries();

    CONSOLE_LOG(`Copying files of ${String(dictionaries.size)} dictionaries to ${destDir} directory:`);

    fsExtra.ensureDirSync(destDir);

    for (const dictionary of dictionaries.values()) {
        for (const file of dictionary.files) {
            fs.copyFileSync(
                file,
                path.join(destDir, path.basename(file)),
            );
            CONSOLE_LOG(file);
        }
    }
}

export async function build(
    packageType: "appimage" | "snap",
): Promise<{ packageFile: string }> {
    await execShell([
        "npm",
        [
            ...`run electron-builder:shortcut -- --publish never --linux ${packageType}`.split(" "),
        ],
    ]);

    // TODO move "fastGlob" to lib function with inner "sanitizeFastGlobPattern" call
    const [packageFile] = await fastGlob(
        sanitizeFastGlobPattern(
            path.join(
                // TODO resolve "./dist" programmatically from "electron-builder.yml"
                "./dist",
                "*." + (
                    packageType === "appimage"
                        ? "AppImage"
                        : packageType
                ),
            ),
        ),
        {
            absolute: true,
            deep: 1,
            onlyFiles: true,
            stats: false,
        },
    );

    if (!packageFile) {
        throw new Error(`Invalid artifact: "${String(packageFile)}"`);
    }

    return {packageFile};
}
