import fs from "fs";
import {promisify} from "util";

import {fetchUrl} from "scripts/lib";

const googleApiUrl = `https://fonts.googleapis.com/css?family=Roboto&text=${encodeURIComponent("0123456789+")}`;
const fontRegExp = /url\(([^)]+)\)/gm;

(async () => { // eslint-disable-line @typescript-eslint/no-floating-promises
    const cssResponse = await fetchUrl([googleApiUrl, {headers: {userAgent: "(none)"}}]);
    const url = fontRegExp.exec(await cssResponse.text());

    if (!url || url.length < 2) {
        throw new Error("Failed to parse font file url");
    }

    const [, fontUrl] = url;
    const fontResponse = await fetchUrl([fontUrl]);

    await promisify(fs.writeFile)("./src/assets/dist/fonts/tray-icon/roboto-derivative.ttf", await fontResponse.buffer());
})();
