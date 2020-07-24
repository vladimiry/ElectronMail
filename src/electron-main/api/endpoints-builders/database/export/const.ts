import {Subject} from "rxjs";

import {IpcMainServiceScan} from "src/shared/api/main";

export type DbExportMailAttachmentItem
    = Unpacked<IpcMainServiceScan["ApiImplArgs"]["dbExportMailAttachmentsNotification"][0]["attachments"]>;

export const MAIL_ATTACHMENTS_EXPORT_NOTIFICATION$
    = new Subject<IpcMainServiceScan["ApiImplArgs"]["dbExportMailAttachmentsNotification"][0]>();
