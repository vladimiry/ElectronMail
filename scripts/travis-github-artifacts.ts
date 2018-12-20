import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import Octokit, {ReposListReleasesParams, ReposListReleasesResponseItem} from "@octokit/rest";
import {equals, pick} from "ramda";
import {promisify} from "util";

// tslint:disable-next-line:no-console
export const consoleLog = console.log;

const [, , ACTION_TYPE_ARG]: Array<"upload" | "download" | string> = process.argv;
const gitHubClient = new Octokit();

const baseGitHubClientParams: ReposListReleasesParams = { // TODO parse owner/repo from package.json
    owner: "vladimiry",
    repo: "email-securely-app",
};
const artifactsReleaseSearchCriteria: Pick<ReposListReleasesResponseItem, "tag_name"> & Partial<ReposListReleasesResponseItem> = {
    tag_name: "travis-artifacts",
    draft: true,
};
const artifactsReleaseSearchCriteriaKeys = Object.keys(artifactsReleaseSearchCriteria);

const ENVS = {
    ARTIFACT_NAME: String(process.env.EMAIL_SECURELY_APP_GITHUB_ARTIFACT_NAME),
    GH_TOKEN: String(process.env.GH_TOKEN),
};

if (!ENVS.ARTIFACT_NAME || !ENVS.GH_TOKEN) {
    throw new Error(`Some of the required environment variables have not been set`);
}

gitHubClient.authenticate({
    type: "oauth",
    token: ENVS.GH_TOKEN,
});

// tslint:disable-next-line:no-floating-promises
(async () => {
    switch (ACTION_TYPE_ARG) {
        case "upload": {
            const file = path.resolve(ENVS.ARTIFACT_NAME);
            const fileBuffer = await promisify(fs.readFile)(file);
            const {upload_url} = await findArtifactsRelease();

            consoleLog(`Uploading "${file}" artifact`);

            await gitHubClient.repos.uploadReleaseAsset({
                url: upload_url,
                headers: {
                    "content-type": "application/zip", // TODO resolve mime type automatically
                    "content-length": fileBuffer.length,
                },
                file: fileBuffer,
                name: path.basename(file),
            });

            break;
        }
        case "download": {
            const file = path.resolve(ENVS.ARTIFACT_NAME);
            const {assets} = await findArtifactsRelease();
            const asset = assets.find(({name, state}) => name === ENVS.ARTIFACT_NAME && state === "uploaded");

            if (!asset) {
                throw new Error(`Failed to resolve asset for downloading`);
            }

            consoleLog(`Downloading artifact to "${file}"`);

            const {data: {url}} = await gitHubClient.repos.getReleaseAsset({...baseGitHubClientParams, asset_id: asset.id});
            let response = await fetch(url, {
                headers: {
                    Authorization: `token ${ENVS.GH_TOKEN}`,
                    Accept: "application/octet-stream",
                },
                redirect: "manual",
            });
            const isRedirect = response.status >= 300 && response.status < 400;
            const redirectLocation = isRedirect && response.headers.get("Location");

            if (redirectLocation) {
                response = await fetch(redirectLocation);
            }

            if (!response.ok) {
                throw new Error(
                    `Invalid response: ${JSON.stringify(pick(["status", "statusText"], response))}`,
                );
            }

            response.body.pipe(fs.createWriteStream(file));

            break;
        }
        default: {
            throw new Error(`Invalid action type argument value "${ACTION_TYPE_ARG}"`);
        }
    }
})();

async function findArtifactsRelease(): Promise<ReposListReleasesResponseItem> {
    const {data} = await gitHubClient.repos.listReleases({...baseGitHubClientParams, per_page: 100});
    const release = data.find((r) => {
        return equals(pick(artifactsReleaseSearchCriteriaKeys, r), artifactsReleaseSearchCriteria);
    });

    if (!release) {
        throw new Error(`Failed to find release artifacts release by "${JSON.stringify(artifactsReleaseSearchCriteria)}" criteria`);
    }

    return release;
}
