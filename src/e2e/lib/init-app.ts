import byline from "byline";
import {expect} from "@playwright/test";
import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import playwright from "playwright";
import {spy as sinonSpy} from "sinon";

import {APP_DIR_PATH, CONF, ENV, MAIN_SCRIPT_FILE, ROOT_DIR_PATH} from "src/e2e/lib/const";
import {asyncDelay} from "src/shared/util";
import {BINARY_NAME, ONE_SECOND_MS, PACKAGE_NAME, PACKAGE_VERSION, PRODUCT_NAME, RUNTIME_ENV_USER_DATA_DIR} from "src/shared/constants";
import {buildWorkflow} from "./workflow";
import {mainProcessEvaluationFunctions} from "src/e2e/lib/util";
import {TestContext} from "./model";

export const initAppWithTestContext = async (
    options: {
        readonly initial: boolean
        readonly allowDestroyedExecutionContext?: boolean
        readonly testContext?: TestContext
    },
    callback: (testContext: TestContext) => Promise<void>,
): Promise<TestContext> => {
    const testContext: Mutable<TestContext> // eslint-disable-line @typescript-eslint/no-unsafe-assignment
        = options.testContext ?? {} as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    testContext.workflow ??= buildWorkflow(testContext);
    testContext.sinon ??= {addAccountSpy: sinonSpy(testContext.workflow, "addAccount")};
    testContext.appDirPath ??= APP_DIR_PATH;
    testContext.outputDirPath ??= path.join(ROOT_DIR_PATH, "./output/e2e", String(Date.now()));
    testContext.userDataDirPath ??= path.join(testContext.outputDirPath, "./app-data");
    testContext.logFilePath ??= path.join(testContext.userDataDirPath, "./log.log");

    [testContext.outputDirPath, testContext.userDataDirPath].forEach((dir) => fsExtra.ensureDirSync(dir));

    if (options.initial) {
        expect(fs.existsSync(path.join(testContext.userDataDirPath, "config.json"))).toStrictEqual(false);
        expect(fs.existsSync(path.join(testContext.userDataDirPath, "settings.bin"))).toStrictEqual(false);
    }

    // TODO (e2e/playwright) pass "executablePath" prop pointed to the actual app resolved by one of the following scenarios:
    //      - actual unpacked or installed deb/mac/exe package
    //      - folder prepared by running "electron-builder --dir"
    const app = testContext.app = await playwright._electron.launch({
        args: [
            MAIN_SCRIPT_FILE,
            `--user-data-dir=${testContext.userDataDirPath}`,
        ],
        env: {
            ...process.env,
            ELECTRON_ENABLE_LOGGING: "1",
            [RUNTIME_ENV_USER_DATA_DIR]: testContext.userDataDirPath,
        },
    });

    testContext.firstWindowPage = await app.firstWindow();

    await (async (): Promise<void> => {
        const el = await testContext.firstWindowPage.waitForSelector(
            ".e2e-stub-element",
            {timeout: ONE_SECOND_MS * 3, state: options.initial ? "visible" : "attached"},
        );
        const elText = await el.innerText();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const {title: pageTitle, userAgent}: { title: string; userAgent: string } = JSON.parse(elText);
        expect(pageTitle).toStrictEqual("");
        expect(userAgent).toBeTruthy();
        // TODO also test user agents of webviews
        {
            const bannedUserAgentWords = (["electron", PRODUCT_NAME, PACKAGE_NAME, BINARY_NAME, PACKAGE_VERSION] as readonly string[])
                .map((banned) => banned.toLowerCase());
            expect(bannedUserAgentWords.some((banned) => userAgent.toLowerCase().includes(banned))).toStrictEqual(false);
        }
    })();

    expect(
        (await app.evaluate(
            mainProcessEvaluationFunctions.testMainProcessSpecificStuff, // eslint-disable-line @typescript-eslint/unbound-method
            {
                initial: options.initial,
                resolveBrowserWindowStringified: mainProcessEvaluationFunctions.resolveBrowserWindow.toString(),
            },
        )).initial,
    ).toStrictEqual(options.initial);

    await asyncDelay(CONF.timeouts.encryption);

    try {
        await callback(testContext);
    } finally {
        { // destroying
            await testContext.workflow.saveScreenshot();

            try {
                await testContext.app.close();
            } catch (e) {
                if (
                    options.allowDestroyedExecutionContext
                    &&
                    (e as { message?: string }).message === "Execution context was destroyed, most likely because of a navigation."
                ) {
                    console.log(e); // eslint-disable-line no-console
                } else {
                    process.exit(1);
                }
            }
        }

        { // after all
            if (fs.existsSync(testContext.logFilePath)) {
                await new Promise((resolve, reject) => {
                    const stream = byline.createStream(
                        fs.createReadStream(testContext.logFilePath),
                    );
                    stream.on("data", (_, line = String(_)) => {
                        if (
                            line.includes("keytar")
                            ||
                            (
                                line.includes("[electron-rpc-api]")
                                &&
                                line.includes(`Object has been destroyed: "sender"`)
                            )
                            ||
                            (
                                line.includes(`failed to resolve window bounds`)
                                &&
                                line.includes("Object has been destroyed")
                            )
                        ) {
                            return;
                        }
                        throw new Error("App log file error line");
                    });
                    stream.on("error", reject);
                    stream.on("end", resolve);
                });
            }

            { // additionally making sure that settings file is actually encrypted by simply scanning it for the raw "login" value
                const rawSetting: string = fs.readFileSync(path.join(testContext.userDataDirPath, "settings.bin")).toString();
                expect(rawSetting.indexOf(ENV.loginPrefix)).toStrictEqual(-1);
            }
        }
    }

    return testContext;
};
