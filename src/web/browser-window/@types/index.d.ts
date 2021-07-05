import {IpcMainServiceScan} from "src/shared/api/main-process";

declare global {
    const __METADATA__: DeepReadonly<IpcMainServiceScan["ApiImplReturns"]["staticInit"]>;
}
