import fetch from "node-fetch";
import fs from "fs";
import {promisify} from "util";

const googleApiUrl = `https://fonts.googleapis.com/css?family=Roboto&text=${encodeURIComponent("0123456789+")}`;
const fontRegExp = /url\(([^)]+)\)/gm;
const outputFile = process.argv[2];

// tslint:disable-next-line:no-floating-promises
(async () => {
    const css = await fetch(googleApiUrl, {headers: {userAgent: "(none)"}})
        .then((response) => response.text());
    const url = fontRegExp.exec(css);

    if (!url || url.length < 2) {
        throw new Error("Failed to parse font file url");
    }

    const fontFileBuffer = await fetch(url[1])
        .then((response) => response.buffer());

    await promisify(fs.writeFile)(outputFile, fontFileBuffer);
})();
