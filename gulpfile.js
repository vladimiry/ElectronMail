// tslint:disable:object-literal-sort-keys

const electronBinary = require("electron");
const exec = require("child_process").exec;
const gulp = require("gulp");
const os = require("os");
const path = require("path");
const psTree = require("ps-tree");
const spawn = require("cross-spawn");
const util = require("util");

const mainScript = path.resolve("app/electron/main/index.js");

gulp.task("start", ["copy:assets"], () => {
    let child;

    start();

    gulp.watch(mainScript, () => {
        (async () => {
            await kill(child.pid);
            start();
        })();
    });

    function start() {
        child = spawn(electronBinary, [mainScript], {stdio: "inherit"});
    }

    async function kill(pid, sig = "SIGKILL") {
        if (os.platform() === "win32") {
            exec(`taskkill /pid ${pid} /T /F`);
            return;
        }

        [...(await util.promisify(psTree)(pid)), {PID: pid}].forEach(({PID}) => {
            try {
                process.kill(Number(PID), sig);
            } catch (err) {
                // tslint:disable-next-line:no-console
                console.log(err);
            }
        });
    }
});

gulp.task("copy:assets", () => {
    return gulp.src("./src/assets/dist/**/*")
        .pipe(gulp.dest("./app/assets"));
});
