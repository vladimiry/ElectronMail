import fetch from "node-fetch";
import fs from "fs";
import mimeTypes from "mime-types";
import path from "path";
import Octokit, {ReposListReleasesParams, ReposListReleasesResponseItem} from "@octokit/rest";
import {equals, pick} from "ramda";
import {promisify} from "util";

import {consoleLevels, consoleLog} from "./lib";

const [, , ACTION_TYPE_ARG, ARTIFACT_NAME]: Array<"upload" | "download" | string> = process.argv;

const CONST = {
    params: (() => {
        const value = {
            ARTIFACT_NAME,
            GH_TOKEN: process.env.GH_TOKEN || "",
        };

        if (!value.ARTIFACT_NAME || !value.GH_TOKEN) {
            throw new Error(`Some of the required parameters have not been set`);
        }

        return value;
    })(),

    baseGitHubClientParams: (() => {
        const value: ReposListReleasesParams = {
            owner: "vladimiry",
            repo: "email-securely-app",
        };
        return value;
    })(),

    releaseSearchCriteria: (() => {
        const value: Pick<ReposListReleasesResponseItem, "tag_name"> & Partial<ReposListReleasesResponseItem> = {
            tag_name: "ci-artifacts",
            draft: true,
        };
        return value;
    })(),
};

const CLIENT = new Octokit({
    auth: `token ${CONST.params.GH_TOKEN}`,
});

(async () => {
    switch (ACTION_TYPE_ARG) {
        case "upload": {
            const file = path.resolve(CONST.params.ARTIFACT_NAME);
            const fileBuffer = await promisify(fs.readFile)(file);
            const {upload_url} = await findArtifactsRelease();

            consoleLog(consoleLevels.title(`Uploading ${consoleLevels.value(file)} artifact`));

            await CLIENT.repos.uploadReleaseAsset({
                url: upload_url,
                headers: {
                    "content-type": mimeTypes.lookup(path.basename(file)) || "application/zip",
                    "content-length": fileBuffer.length,
                },
                file: fileBuffer,
                name: path.basename(file),
            });

            break;
        }
        case "download": {
            const {assets} = await findArtifactsRelease();
            const asset = assets.find(({name, state}) => name === CONST.params.ARTIFACT_NAME && state === "uploaded");
            const file = path.resolve(CONST.params.ARTIFACT_NAME);

            if (!asset) {
                throw new Error(`Failed to resolve ${consoleLevels.value(ARTIFACT_NAME)} asset for downloading`);
            }
            consoleLog(consoleLevels.title(`Downloading ${consoleLevels.value(file)} artifact`));

            const {data: {url}} = await CLIENT.repos.getReleaseAsset({...CONST.baseGitHubClientParams, asset_id: asset.id});
            let response = await fetch(url, {
                headers: {
                    Authorization: `token ${CONST.params.GH_TOKEN}`,
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
            throw new Error(`Unsupported action type: ${consoleLevels.value(ACTION_TYPE_ARG)}`);
        }
    }
})().catch((error) => {
    consoleLog(consoleLevels.error(error));
    process.exit(1);
});

async function findArtifactsRelease(): Promise<ReposListReleasesResponseItem> {
    const {data} = await CLIENT.repos.listReleases({...CONST.baseGitHubClientParams, per_page: 100});
    const releaseSearchCriteriaKeys = Object.keys(CONST.releaseSearchCriteria);
    const release = data.find((r) => {
        return equals(pick(releaseSearchCriteriaKeys, r), CONST.releaseSearchCriteria);
    });

    if (!release) {
        throw new Error(`Failed to find release artifacts release`);
    }

    return release;
}
