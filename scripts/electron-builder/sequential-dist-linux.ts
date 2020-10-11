import {Target} from "app-builder-lib";

import {execShell} from "scripts/lib";

const targets: Array<typeof Target.prototype.name> = [
    "appimage",
    "snap",
    "deb",
    "freebsd",
    "pacman",
    "rpm",
];

async function clean(): Promise<void> {
    // TODO take "dist" reading "directories.output" from electron-builder.yml
    await execShell(["npx", ["--no-install", "rimraf", "./dist/linux-unpacked", "./dist/*.yaml"]]);
}

(async () => { // eslint-disable-line @typescript-eslint/no-floating-promises
    for (const target of targets) {
        await clean();
        await execShell(["yarn", [`electron-builder:dist:linux:${target}`]]);
    }

    await clean();
})();
