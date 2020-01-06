import {IpcMainServiceScan} from "src/shared/api/main";
import {ReadonlyDeep} from "type-fest";

declare global {
    const BUILD_ANGULAR_COMPILATION_FLAGS: import("webpack-configs/model").BuildAngularCompilationFlags;

    const __METADATA__: ReadonlyDeep<IpcMainServiceScan["ApiImplReturns"]["staticInit"]>;
}
