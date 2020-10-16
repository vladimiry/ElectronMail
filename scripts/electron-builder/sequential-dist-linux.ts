import {Target} from "app-builder-lib";

import {CONSOLE_LOG, execShell} from "scripts/lib";

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

(async () => {
    for (const target of targets) {
        await clean();
        await execShell(["yarn", [`electron-builder:dist:linux:${target}`]]);
    }

    await clean();
})().catch((error) => {
    CONSOLE_LOG(error);
    process.exit(1);
});
