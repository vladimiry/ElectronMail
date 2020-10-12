import path from "path";
import pathIsInside from "path-is-inside";
import {randomString} from "remeda";

export const GIT_CLONE_ABSOLUTE_DIR = path.resolve(process.cwd(), "./output/__test__/electron-main/__generated__");

export const generateElectronMainTestPrefixedFile = (file: string): string => {
    const resultFile = path.join(
        GIT_CLONE_ABSOLUTE_DIR,
        `${String(Date.now())}-${randomString(7)}`,
        file,
    );

    if (!pathIsInside(resultFile, GIT_CLONE_ABSOLUTE_DIR)) {
        throw new Error(`Forbidden file resource access attempt: ${resultFile}`);
    }

    return resultFile;
};
