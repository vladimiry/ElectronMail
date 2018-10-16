import {ofType, unionize} from "@vladimiry/unionize";

import {DbAccountPk, Folder, Mail, View} from "src/shared/model/database";

export const DB_VIEW_ACTIONS = unionize({
        MountInstance: ofType<{ dbAccountPk: DbAccountPk; finishPromise: Promise<void>; }>(),
        UnmountInstance: ofType<{ dbAccountPk: DbAccountPk; }>(),
        SetFolders: ofType<{ dbAccountPk: DbAccountPk; folders: { system: View.Folder[]; custom: View.Folder[]; } }>(),
        SelectFolder: ofType<{ dbAccountPk: DbAccountPk; folderPk?: Folder["pk"]; distinct?: boolean; }>(),
        SelectMailRequest: ofType<{ dbAccountPk: DbAccountPk; mailPk: Mail["pk"]; }>(),
        SelectMail: ofType<{ dbAccountPk: DbAccountPk; mail: Mail; }>(),
        ToggleRootNodesCollapsing: ofType<{ dbAccountPk: DbAccountPk } & Pick<View.RootConversationNode, "entryPk">>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "db-view:",
    },
);
