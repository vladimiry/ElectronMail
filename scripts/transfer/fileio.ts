// TODO drop this file when data sharing between jobs is implemented:
// https://github.com/travis-ci/travis-ci/issues/7590
// https://travis-ci.community/t/using-unified-cache-control-cache-identity/1531

import {LOG, LOG_LEVELS, execShell, fetchUrl} from "scripts/lib";
import {PACKAGE_NAME, PACKAGE_VERSION} from "src/shared/constants";

const [, , ACTION_TYPE_ARG, FILE_ARG] = process.argv as [null, null, "upload" | "travis-upload" | "travis-download", string];

const SERVICE_URL = "https://file.io/";
const SERVICE_MAX_DAYS = 1;

type ServiceResponse =
    | { success: true; key: string; link: string; expiry: string }
    | { success: false; error: number; message: string; };

(async () => {
    switch (ACTION_TYPE_ARG) {
        case "upload": {
            await uploadFileArg();
            break;
        }
        case "travis-upload": {
            const {TRAVIS_BUILD_NUMBER} = process.env;

            for (const jobNumber of [2, 3, 4]) {
                const response = await uploadFileArg();
                const wrapTag = buildTravisOutputWrapTag(`${TRAVIS_BUILD_NUMBER}.${jobNumber}`);
                const output = `${wrapTag}${response.link}${wrapTag}`;

                LOG(`Download link: ${LOG_LEVELS.value(output)}`);
            }

            break;
        }
        case "travis-download": {
            const {TRAVIS_JOB_NUMBER, TRAVIS_JOB_ID} = process.env;
            const jobOrder = Number(
                String(TRAVIS_JOB_NUMBER)
                    .split(".")
                    .pop(),
            );
            // first job uploads the artifacts, ordering starts from 1
            const uploadingJobId = Number(TRAVIS_JOB_ID) - jobOrder + 1;
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

async function uploadFileArg(): Promise<Extract<ServiceResponse, { success: true; }>> {
    const {stdout: jsonResponse} = await execShell([
        "curl",
        [
            "-F", `file=@${FILE_ARG}`,
            "--fail",
            `${SERVICE_URL}?expires=${SERVICE_MAX_DAYS}d`,
        ],
    ]);
    const response: ServiceResponse = JSON.parse(jsonResponse);

    if (!response.success) {
        throw new Error(`Error response received: ${JSON.stringify(response)}`);
    }
    if (!response.link.startsWith(SERVICE_URL)) {
        throw new Error(`Download url "${response.link}" doesn't start from "${SERVICE_URL}"`);
    }
    if (!response.expiry.startsWith(`${SERVICE_MAX_DAYS} day`)) {
        throw new Error(`Unexpected "expiry" value received`);
    }

    return response;
}

function buildTravisOutputWrapTag(jobNumber: string) {
    return `<TRAVIS_OUTPUT_TRANSFR_TAG_${PACKAGE_NAME}_${PACKAGE_VERSION}_JOB_${jobNumber}>`.toUpperCase();
}
