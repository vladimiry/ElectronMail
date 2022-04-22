import {Config} from "src/shared/model/options";
import {Controller} from "src/electron-main/spell-check/model";
import * as DbModel from "src/shared/model/database";
import {IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS} from "src/shared/api/main-process/actions";
import {props, propsRecordToActionsRecord, UnionOf} from "src/shared/util/ngrx";

// WARN: do not put sensitive data or any data to the main process notification stream, only status-like signals
export const IPC_MAIN_API_NOTIFICATION_ACTIONS = propsRecordToActionsRecord(
    {
        ActivateBrowserWindow: null,
        TargetUrl: props<DeepReadonly<NoExtraProps<{
            url: string;
            // percent sizes get calculated since absolute sizes use introduce a mistake if "zoomFactor is not 1"
            position?: { cursorXPercent: number; cursorYPercent: number };
        }>>>(),
        DbPatchAccount: props<{
            key: DbModel.DbAccountPk;
            entitiesModified: boolean;
            stat: { mails: number; folders: number; contacts: number; unread: number };
        }>(),
        DbIndexerProgressState:
            props<Extract<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS>, { type: "ProgressState" }>["payload"]>(),
        DbAttachmentExportRequest: props<DeepReadonly<{
            uuid: string;
            key: DbModel.DbAccountPk;
            mailPk: DbModel.Mail["pk"];
            timeoutMs: number;
        }>>(),
        Locale: props<{ locale: ReturnType<Controller["getCurrentLocale"]> }>(),
        ConfigUpdated: props<Config>(),
        OpenOptions: null,
        LogOut: null,
        SignedInStateChange: props<{ signedIn: boolean }>(),
        ErrorMessage: props<{ message: string }>(),
        InfoMessage: props<{ message: string }>(),
        PowerMonitor: props<{ message: "suspend" | "resume" | "shutdown" }>(),
        ProtonSessionTokenCookiesModified: props<{ key: DbModel.DbAccountPk }>(),
        NativeTheme: props<{ shouldUseDarkColors: boolean }>(),
    },
    {prefix: __filename},
);
