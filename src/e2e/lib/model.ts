import type {ElectronApplication} from "playwright";

import {buildWorkflow} from "./workflow";

export interface TestContext {
    readonly appDirPath: string
    readonly logFilePath: string
    readonly outputDirPath: string
    readonly userDataDirPath: string
    readonly app: ElectronApplication
    readonly firstWindowPage: Unpacked<ReturnType<ElectronApplication["firstWindow"]>>
    readonly workflow: ReturnType<typeof buildWorkflow>
    readonly sinon: {
        readonly addAccountSpy: sinon.SinonSpy<[Parameters<ReturnType<typeof buildWorkflow>["addAccount"]>[0]], Promise<void>>
    }
}
