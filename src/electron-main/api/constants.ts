import {BehaviorSubject} from "rxjs";

import {Endpoints, IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {Unpacked} from "src/shared/types";

type Notification = Unpacked<ReturnType<Endpoints["notification"]>>;

export const NOTIFICATION_SUBJECT = new BehaviorSubject<Notification>(IPC_MAIN_API_NOTIFICATION_ACTIONS.ActivateBrowserWindow());
