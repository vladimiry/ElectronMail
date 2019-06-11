import {LOG, execShell} from "scripts/lib";

(async () => {
    await execShell(["yarn", ["electron-builder:dist:linux:appimage"]]);
    await clean();
    await execShell(["yarn", ["electron-builder:dist:linux:snap"]]);
    await clean();
    await execShell(["npx", ["electron-builder", "--publish", "onTagOrDraft", "--x64", "--linux", "pacman"]]);
    await clean();
    await execShell(["npx", ["electron-builder", "--publish", "onTagOrDraft", "--x64", "--linux", "deb"]]);
    await clean();
    await execShell(["npx", ["electron-builder", "--publish", "onTagOrDraft", "--x64", "--linux", "freebsd"]]);
    await clean();
    await execShell(["npx", ["electron-builder", "--publish", "onTagOrDraft", "--x64", "--linux", "rpm"]]);
    await clean();
})().catch((error) => {
    LOG(error);
    process.exit(1);
});

async function clean() {
    // TODO take "dist" reading "directories.output" from electron-builder.yml
    await execShell(["npx", ["rimraf", "./dist/linux-unpacked", "./dist/*.yaml"]]);
}
