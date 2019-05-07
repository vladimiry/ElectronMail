import {Target} from "app-builder-lib";

import {execShell} from "scripts/lib";

const targets: Array<typeof Target.prototype.name> = [
    "appimage",
    "deb",
    "freebsd",
    "pacman",
    "rpm",
    "snap",
];

// tslint:disable-next-line:no-floating-promises
(async () => {
    for (const target of targets) {
        await clean();
        await execShell(["yarn", [`electron-builder:dist:linux:${target}`]]);
    }

    await clean();
})();

async function clean() {
    // TODO take "dist" reading "directories.output" from electron-builder.yml
    await execShell(["npx", ["rimraf", "./dist/linux-unpacked", "./dist/*.yaml"]]);
}
