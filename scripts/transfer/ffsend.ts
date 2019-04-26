// TODO remove this file as unused

import fs from "fs";
import fsExtra from "fs-extra";
import mkdirp from "mkdirp";
import os from "os";
import path from "path";
import {promisify} from "util";

import {LOG, LOG_LEVELS, PROC_CWD, execShell, fetchUrl} from "scripts/lib";

const FFSEND_VERSION = "v0.2.45";
const FFSEND_BINARY_FOLDER_URL = `https://github.com/timvisee/ffsend/releases/download/${FFSEND_VERSION}`;
const FFSEND_BINARY_NAME = resolveBinaryName();
const FFSEND_BINARY_FILE = path.resolve(PROC_CWD, "./output", FFSEND_BINARY_NAME);
const FFSEND_DOWNLOAD_URL_PREFIX = "https://send.firefox.com/download/";

const [, , ACTION_TYPE_ARG, FILE_ARG] = process.argv as [null, null, "upload" | "travis-upload" | "travis-download", string];

function resolveBinaryName(): string {
    const fileNames: Record<Extract<ReturnType<typeof os.platform>, "darwin" | "linux" | "win32">, string> = Object.freeze({
        darwin: `ffsend-${FFSEND_VERSION}-macos`,
        linux: `ffsend-${FFSEND_VERSION}-linux-x64-static`,
        win32: `ffsend-${FFSEND_VERSION}-windows-x64-static.exe`,
    });
    const platform = os.platform();

    if (platform in fileNames) {
        return fileNames[platform as keyof typeof fileNames];
    }

    throw new Error(`Failed to resolve ffsend binary name for ${platform} platform`);
}

(async () => {
    switch (ACTION_TYPE_ARG) {
        case "upload": {
            const {downloadUrl} = await uploadFileArg();

            LOG(LOG_LEVELS.value(downloadUrl));

            break;
        }
        case "travis-upload": {
            const {TRAVIS_BUILD_NUMBER} = process.env;

            for (const jobNumber of [2, 3, 4]) {
                const {downloadUrl} = await uploadFileArg();
                const wrapTag = buildTravisOutputWrapTag(`${TRAVIS_BUILD_NUMBER}.${jobNumber}`);
                const output = `${wrapTag}${downloadUrl.trim()}${wrapTag}`;

                LOG(`Download link: ${LOG_LEVELS.value(output)}`);
            }

            break;
        }
        case "travis-download": {
            const {TRAVIS_BUILD_ID, TRAVIS_JOB_NUMBER} = process.env;
            const uploadingJobId = Number(TRAVIS_BUILD_ID) + 1; // first job uploads the artifacts
            // TODO parse url from process.env.TRAVIS_JOB_WEB_URL
            const uploadingJobLogFileUrl = `https://api.travis-ci.org/v3/job/${uploadingJobId}/log.txt`;
            const uploadingJobLogResponse = await fetchUrl([uploadingJobLogFileUrl]);
            const uploadingJobLogContent = await uploadingJobLogResponse.text();
            const downloadUrlWrapTag = buildTravisOutputWrapTag(String(TRAVIS_JOB_NUMBER));
            const downloadUrlParseRe = new RegExp(`.*${downloadUrlWrapTag}(${FFSEND_DOWNLOAD_URL_PREFIX}.*)${downloadUrlWrapTag}.*`);
            const [, downloadUrl = null] = uploadingJobLogContent.match(downloadUrlParseRe) || [];

            if (!downloadUrl) {
                throw new Error(`Failed to parse download url using "${downloadUrlParseRe.source}" RegExp pattern`);
            }

            await ensureBinaryFilePrepared();

            // TODO throws error on windows:
            // tslint:disable-next-line:max-line-length
            // Error: C:\Users\travis\build\vladimiry\ElectronMail\output\ffsend-v0.2.45-windows-x64-static.exe exited with non-zero code: 3221225781
            await execShell([FFSEND_BINARY_FILE, ["download", "--extract", downloadUrl]]);

            break;
        }
        default: {
            throw new Error(`Unsupported action type: ${LOG_LEVELS.value(ACTION_TYPE_ARG)}`);
        }
    }
})().catch((error) => {
    LOG(error);
    process.exit(1);
});

async function uploadFileArg(): Promise<{ downloadUrl: string }> {
    await ensureBinaryFilePrepared();

    const {stdout: downloadUrl} = await execShell([FFSEND_BINARY_FILE, ["upload", "--quiet", FILE_ARG]]);

    if (!downloadUrl.startsWith(FFSEND_DOWNLOAD_URL_PREFIX)) {
        throw new Error(`Download url "${downloadUrl}" doesn't start from "${FFSEND_DOWNLOAD_URL_PREFIX}"`);
    }

    return {downloadUrl};
}

function buildTravisOutputWrapTag(jobNumber: string) {
    return `<TRAVIS_OUTPUT_TAG_FFSEND_${FFSEND_VERSION}_JOB_${jobNumber}>`;
}

async function ensureBinaryFilePrepared(): Promise<void> {
    const url = `${FFSEND_BINARY_FOLDER_URL}/${FFSEND_BINARY_NAME}`;
    const dir = path.dirname(FFSEND_BINARY_FILE);

    if (!(await fsExtra.pathExists(dir))) {
        await promisify(mkdirp)(dir);
    }

    if (await fsExtra.pathExists(FFSEND_BINARY_FILE)) {
        LOG(LOG_LEVELS.title(`Binary ${LOG_LEVELS.value(FFSEND_BINARY_FILE)} exists`));
        await ensureBinaryFileExecutable();
        return;
    }

    const response = await fetchUrl([url]);
    await promisify(fs.writeFile)(FFSEND_BINARY_FILE, await response.buffer());

    if (!(await fsExtra.pathExists(FFSEND_BINARY_FILE))) {
        throw new Error(`Failed to save ${url} to ${FFSEND_BINARY_FILE} file`);
    }

    await ensureBinaryFileExecutable();
}

async function ensureBinaryFileExecutable(): Promise<void> {
    if (os.platform() === "win32") {
        return;
    }

    await execShell(["chmod", ["+x", FFSEND_BINARY_FILE]]);
}
