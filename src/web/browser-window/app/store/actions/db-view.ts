import {ofType, unionize} from "@vladimiry/unionize";

import {IpcMainApiEndpoints, IpcMainServiceScan} from "src/shared/api/main";
import {Mail, View} from "src/shared/model/database";
import {MailsBundleKey, SearchMailsBundleKey} from "src/web/browser-window/app/store/reducers/db-view";
import {WebAccountIndexProp, WebAccountPk} from "src/web/browser-window/app/model";

export const DB_VIEW_ACTIONS = unionize({
        MountInstance: ofType<{
            webAccountPk: WebAccountPk;
            finishPromise: Promise<void>;
        }>(),
        UnmountInstance: ofType<{
            webAccountPk: WebAccountPk;
        }>(),
        SetFolders: ofType<{
            webAccountPk: WebAccountPk;
            folders: { system: View.Folder[]; custom: View.Folder[] };
        }>(),
        SelectFolder: ofType<{
            webAccountPk: WebAccountPk;
            selectedFolderData?: Pick<View.Folder, "id">;
            distinct?: boolean;
        }>(),
        SelectMailRequest: ofType<{
            webAccountPk: WebAccountPk;
            mailPk: Mail["pk"];
        }>(),
        SelectMail: ofType<{
            webAccountPk: WebAccountPk;
            value?: {
                listMailPk: Mail["pk"];
                rootNode: View.RootConversationNode;
                conversationMail: Mail;
            };
        }>(),
        DbExport: ofType<NoExtraProps<DeepReadonly<IpcMainServiceScan["ApiImplArgs"]["dbExport"][0] & WebAccountIndexProp>>>(),
        SelectConversationMailRequest: ofType<{
            webAccountPk: WebAccountPk;
            mailPk: Mail["pk"];
        }>(),
        SelectConversationMail: ofType<{
            webAccountPk: WebAccountPk;
            conversationMail: Mail;
        }>(),
        SortMails: ofType<{
            webAccountPk: WebAccountPk;
            mailsBundleKey: MailsBundleKey;
            sorterIndex: number;
        }>(),
        Paging: ofType<{
            webAccountPk: WebAccountPk;
            mailsBundleKey: MailsBundleKey;
            reset?: boolean;
            noIncrement?: boolean;
        }>(),
        FullTextSearchRequest: ofType<Parameters<IpcMainApiEndpoints["dbFullTextSearch"]>[0] & WebAccountIndexProp>(),
        FullTextSearch: ofType<{
            webAccountPk: WebAccountPk;
            value: Unpacked<ReturnType<IpcMainApiEndpoints["dbFullTextSearch"]>>;
        }>(),
        ResetSearchMailsBundleItems: ofType<{
            webAccountPk: WebAccountPk;
            mailsBundleKey: SearchMailsBundleKey;
        }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "db-view:",
    },
);
