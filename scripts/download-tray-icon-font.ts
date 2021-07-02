import fs from "fs";
import {promisify} from "util";

import {catchTopLeventAsync, fetchUrl} from "scripts/lib";

const googleApiUrl = `https://fonts.googleapis.com/css?family=Roboto&text=${encodeURIComponent("0123456789+")}`;
const outputFile = "./src/assets/dist/fonts/tray-icon/roboto-derivative.ttf";
const fontRegExp = /url\(([^)]+)\)/gm;
const headers = {userAgent: "(none)"} as const;

catchTopLeventAsync(async () => {
    const cssResponse = await fetchUrl(googleApiUrl, {headers});
    const url = fontRegExp.exec(await cssResponse.text());

    if (!url || url.length < 2) {
        throw new Error("Failed to parse font file url");
    }

    const [, fontUrl] = url;
    if (!fontUrl) {
        throw new Error("Failed to resolve font URL");
    }
    const fontResponse = await fetchUrl(fontUrl, {headers});

    await promisify(fs.writeFile)(outputFile, await fontResponse.buffer());
});
