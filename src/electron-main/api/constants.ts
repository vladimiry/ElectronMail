import {ReplaySubject} from "rxjs";

import {Endpoints} from "src/shared/api/main";
import {Unpacked} from "src/shared/types";

type Notification = Unpacked<ReturnType<Endpoints["notification"]>>;

export const NOTIFICATION_SUBJECT = new ReplaySubject<Notification>(1);
