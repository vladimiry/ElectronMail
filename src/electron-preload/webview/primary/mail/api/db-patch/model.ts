import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import {ProtonPrimaryMailApiScan} from "src/shared/api/webview/primary-mail";

export type DbPatchBundle = NoExtraProps<Pick<Parameters<IpcMainApiEndpoints["dbPatch"]>[0], "patch" | "metadata">>;

export type BuildDbPatchMethodReturnType = ProtonPrimaryMailApiScan["ApiImplReturns"]["buildDbPatch"];
