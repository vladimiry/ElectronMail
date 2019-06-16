import {Target} from "app-builder-lib";

import {LOG, execShell} from "scripts/lib";

const targets: Array<typeof Target.prototype.name> = [
    "appimage",
    "snap",
    "deb",
    "freebsd",
    "pacman",
    "rpm",
];

(async () => {
    for (const target of targets) {
        await clean();
        await execShell(["yarn", [`electron-builder:dist:linux:${target}`]]);
    }

    await clean();
})().catch((error) => {
    LOG(error);
    process.exit(1);
});

async function clean() {
    // TODO take "dist" reading "directories.output" from electron-builder.yml
    await execShell(["npx", ["rimraf", "./dist/linux-unpacked", "./dist/*.yaml"]]);
}
