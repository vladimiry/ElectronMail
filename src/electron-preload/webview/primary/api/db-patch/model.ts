import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import {ProtonPrimaryApiScan} from "src/shared/api/webview/primary";

export type DbPatchBundle = NoExtraProps<Pick<Parameters<IpcMainApiEndpoints["dbPatch"]>[0], "patch" | "metadata">>;

export type BuildDbPatchMethodReturnType = ProtonPrimaryApiScan["ApiImplReturns"]["buildDbPatch"];
