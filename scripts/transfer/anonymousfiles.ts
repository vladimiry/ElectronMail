import {LOG, LOG_LEVELS, execShell} from "scripts/lib";

const [, , ACTION_TYPE_ARG, FILE_ARG] = process.argv as [null, null, "upload", string];

const UPLOAD_URL = "https://api.anonymousfiles.io/";
const DOWNLOAD_URL_PREFIX = "https://anonymousfiles.io/";
const SERVICE_MAX_DAYS = 1;

interface ServiceResponse {
    id: string;
    name: string;
    size: number;
    url: string;
}

(async () => {
    switch (ACTION_TYPE_ARG) {
        case "upload": {
            await uploadFileArg();
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

async function uploadFileArg(): Promise<ServiceResponse> {
    const {stdout: jsonResponse} = await execShell([
        "curl",
        [
            "--form", `file=@${FILE_ARG}`,
            "--form", `expires=${SERVICE_MAX_DAYS}d`,
            "--form", `no_index=true`,
            "--fail",
            `${UPLOAD_URL}`,
        ],
    ]);
    const response: ServiceResponse = JSON.parse(jsonResponse);

    if (!response.url.startsWith(DOWNLOAD_URL_PREFIX)) {
        throw new Error(`Download url "${response.url}" doesn't start from "${DOWNLOAD_URL_PREFIX}"`);
    }

    return response;
}
