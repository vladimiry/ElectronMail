import {IpcMainServiceScan} from "src/shared/api/main";

declare global {
    const BUILD_ANGULAR_COMPILATION_FLAGS: import("webpack-configs/model").BuildAngularCompilationFlags;

    const __METADATA__: DeepReadonly<IpcMainServiceScan["ApiImplReturns"]["staticInit"]>;
}
