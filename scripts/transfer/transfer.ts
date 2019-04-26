// TODO remove this file as unused

import path from "path";

import {LOG, LOG_LEVELS, execShell, fetchUrl} from "scripts/lib";
import {PACKAGE_NAME, PACKAGE_VERSION} from "src/shared/constants";

const [, , ACTION_TYPE_ARG, FILE_ARG] = process.argv as [null, null, "upload" | "travis-upload" | "travis-download", string];

const SERVICE_URL = "https://transfer.sh";
const SERVICE_MAX_DOWNLOADS = 3;
const SERVICE_MAX_DAYS = 1;

(async () => {
    switch (ACTION_TYPE_ARG) {
        case "upload": {
            await uploadFileArg();
            break;
        }
        case "travis-upload": {
            const {TRAVIS_BUILD_NUMBER} = process.env;

            for (const jobNumber of [2, 3, 4]) {
                const {downloadUrl} = await uploadFileArg();
                const wrapTag = buildTravisOutputWrapTag(`${TRAVIS_BUILD_NUMBER}.${jobNumber}`);
                const output = `${wrapTag}${downloadUrl}${wrapTag}`;

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
            const downloadUrlParseRe = new RegExp(`.*${downloadUrlWrapTag}(${SERVICE_URL}.*)${downloadUrlWrapTag}.*`);
            const [, downloadUrl = null] = uploadingJobLogContent.match(downloadUrlParseRe) || [];

            if (!downloadUrl) {
                throw new Error(`Failed to parse artifact download url using "${downloadUrlParseRe.source}" RegExp pattern`);
            }

            const fileName = "webclients-artifact.tar";

            await execShell(["curl", [downloadUrl, "-o", fileName, "--fail"]]);
            await execShell(["tar", ["-xvf", fileName]]);

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
    const {stdout: downloadUrl} = await execShell([
        "curl",
        [
            "-H", `Max-Downloads: ${SERVICE_MAX_DOWNLOADS}`,
            "-H", `Max-Days: ${SERVICE_MAX_DAYS}`,
            "--fail",
            "--upload-file", FILE_ARG,
            `${SERVICE_URL}/${path.basename(FILE_ARG)}`,
        ],
    ]);

    if (!downloadUrl.startsWith(SERVICE_URL)) {
        throw new Error(`Download url "${downloadUrl}" doesn't start from "${SERVICE_URL}"`);
    }

    return {downloadUrl};
}

function buildTravisOutputWrapTag(jobNumber: string) {
    return `<TRAVIS_OUTPUT_TRANSFR_TAG_${PACKAGE_NAME}_@${PACKAGE_VERSION}_JOB_${jobNumber}>`;
}
