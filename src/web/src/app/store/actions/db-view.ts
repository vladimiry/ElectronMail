import {ofType, unionize} from "@vladimiry/unionize";

import {DbAccountPk, Folder, Mail, View} from "src/shared/model/database";

export const DB_VIEW_ACTIONS = unionize({
        MountInstance: ofType<{ dbAccountPk: DbAccountPk; finishPromise: Promise<void>; }>(),
        UnmountInstance: ofType<{ dbAccountPk: DbAccountPk; }>(),
        SetFolders: ofType<{ dbAccountPk: DbAccountPk; folders: { system: View.Folder[]; custom: View.Folder[]; } }>(),
        SelectFolder: ofType<{ dbAccountPk: DbAccountPk; folderPk?: Folder["pk"]; distinct?: boolean; }>(),
        SelectListMailToDisplayRequest: ofType<{
            dbAccountPk: DbAccountPk;
            mailPk: Mail["pk"];
        }>(),
        SelectListMailToDisplay: ofType<{
            dbAccountPk: DbAccountPk;
            listMailPk: Mail["pk"];
            rootNode: View.RootConversationNode;
            rootNodeMail: Mail;
        }>(),
        SelectRootNodeMailToDisplayRequest: ofType<{
            dbAccountPk: DbAccountPk;
            mailPk: Mail["pk"];
        }>(),
        SelectRootNodeMailToDisplay: ofType<{
            dbAccountPk: DbAccountPk;
            rootNodeMail: Mail;
        }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "db-view:",
    },
);
