import fs from "fs";
import packageJSON from "package.json" with {type: "json"};
import path from "path";

import {listInstallationPackageFiles} from "scripts/dist-packages/lib";

// WARN: use trusted imports ONLY here since this script gets GH token with "contents: write" permission

const [, , DIST_DIRECTORY] = process.argv as [null, null, string];
const {GITHUB_TOKEN} = process.env;
const [OWNER, REPO] = (process.env.GITHUB_REPOSITORY ?? "").split("/");

const API_BASE_URL = process.env.GITHUB_API_URL || "https://api.github.com";
const API_HEADERS = {
    "Authorization": `Bearer ${GITHUB_TOKEN}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2026-03-10",
    "User-Agent": "Pure-Fetch-Release-Uploader",
} as const;

const consoleLog: typeof console.log = (...args) => console.log(...args); // eslint-disable-line no-console

(async () => {
    const baseArgs = {tag: `v${packageJSON.version}`, overwriting: true} as const;
    for (const filePath of await listInstallationPackageFiles(DIST_DIRECTORY)) {
        await uploadToDraftRelease({filePath, ...baseArgs});
    }
})().catch((error) => {
    consoleLog(error);
    process.exit(1);
});

async function uploadToDraftRelease(
    {filePath, tag, overwriting}: {filePath: string; tag: string; overwriting?: boolean},
): Promise<{downloadUrl: string}> {
    const resolvedFilePath = path.resolve(filePath);
    const assetFileName = path.basename(resolvedFilePath);

    if (!GITHUB_TOKEN || !OWNER || !REPO) {
        throw new Error("Missing required environment variables: GITHUB_TOKEN / OWNER / REPO");
    }
    if (!fs.existsSync(resolvedFilePath)) {
        throw new Error(`File not found at path: ${resolvedFilePath}`);
    }

    const {id: releaseId, upload_url: releaseUploadUrl, draft: releaseDraft} = await (async () => {
        type Release = {id: number; name: string; upload_url: string; draft: boolean};
        consoleLog(`List existing releases to pick draft one with "${tag}" name...`);
        const releasesResponse = await fetch(`${API_BASE_URL}/repos/${OWNER}/${REPO}/releases`, {method: "GET", headers: API_HEADERS});
        const releases = await parseResponse<Array<Release>>(releasesResponse, "Failed to list releases");
        const existingRelease: Release | undefined = releases.find(({name}) => name === tag);
        if (existingRelease) {
            consoleLog(`Found existing release (ID: ${existingRelease.id}).`);
            return existingRelease;
        }
        consoleLog("Existing release not found. Creating a new one...");
        const newReleaseResponse = await fetch(`${API_BASE_URL}/repos/${OWNER}/${REPO}/releases`, {
            method: "POST",
            headers: API_HEADERS,
            body: JSON.stringify({tag_name: tag, name: tag, draft: true}),
        });
        const newRelease = await parseResponse<Release>(newReleaseResponse, "Failed to create release");
        consoleLog(`Created new release (ID: ${newRelease.id}).`);
        return newRelease;
    })();

    if (!releaseDraft) {
        throw new Error(`Resolved release with "${tag}" name for further processing, but not "draft" type`);
    }

    await (async () => {
        const response = await fetch(`${API_BASE_URL}/repos/${OWNER}/${REPO}/releases/${releaseId}/assets`, {
            method: "GET",
            headers: API_HEADERS,
        });
        const assets = await parseResponse<Array<{id: number; name: string}>>(response, "Failed to list release assets");
        const existing = assets.find(({name}) => name === assetFileName);
        if (!existing) return;
        if (!overwriting) throw new Error(`File "${assetFileName}" already exists on the release and overwriting is disabled.`);
        consoleLog(`File "${assetFileName}" already exists. Deleting the old asset...`);
        const deleteResponse = await fetch(`${API_BASE_URL}/repos/${OWNER}/${REPO}/releases/assets/${existing.id}`, {
            method: "DELETE",
            headers: API_HEADERS,
        });
        if (!deleteResponse.ok) {
            throw new Error(`Failed to delete asset: ${deleteResponse.status} ${deleteResponse.statusText}`);
        }
        consoleLog("Deleted old asset successfully.");
    })();

    consoleLog(`Uploading "${assetFileName}" ...`);
    const uploadResponse = await fetch(
        new URL(
            `/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(assetFileName)}`,
            new URL(releaseUploadUrl).origin,
        ).toString(),
        {
            method: "POST",
            headers: {
                ...API_HEADERS,
                "Content-Type": "application/octet-stream",
                "Content-Length": fs.statSync(resolvedFilePath).size.toString(),
            },
            body: fs.readFileSync(resolvedFilePath),
        },
    );
    const uploadedAsset = await parseResponse<{browser_download_url: string}>(uploadResponse, "Failed to upload release asset");
    const downloadUrl = uploadedAsset.browser_download_url;

    consoleLog(`The "${assetFileName}" file asset successfully uploaded to the "${tag}" draft release. Asset URL: ${downloadUrl}`);

    return {downloadUrl};
}

async function parseResponse<T>(response: Response, errorMessage: string): Promise<T> {
    if (response.ok) {
        return response.json() as T;
    }
    type ErrorType = Record<keyof Pick<typeof response, "status" | "body">, unknown>;
    const error = new Error(`${errorMessage}: ${response.status} ${response.statusText}`) as unknown as ErrorType;
    error.status = response.status;
    error.body = await response.text().catch(() => "");
    throw error;
}
