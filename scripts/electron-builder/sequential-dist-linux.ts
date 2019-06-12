import {Target} from "app-builder-lib";

import {LOG, execShell} from "scripts/lib";

const targetsToPublish: Array<typeof Target.prototype.name> = [
    // "snap",
    "appimage",
    "pacman",
    "deb",
    "freebsd",
    "rpm",
];

(async () => {
    await execShell(["yarn", ["electron-builder:dist:linux:snap"]]);
    await clean();

    for (const targetToPublish of targetsToPublish) {
        await clean();
        await execShell(["npx", ["electron-builder", "--publish", "onTagOrDraft", "--x64", "--linux", targetToPublish]]);
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
