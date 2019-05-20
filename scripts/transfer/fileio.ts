import {LOG, LOG_LEVELS, execShell} from "scripts/lib";

const [, , ACTION_TYPE_ARG, FILE_ARG] = process.argv as [null, null, "upload", string];

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
