import {ofType, unionize} from "@vladimiry/unionize";

import {Arguments, Unpacked} from "src/shared/types";
import {DbAccountPk, Mail, View} from "src/shared/model/database";
import {Endpoints} from "src/shared/api/main";
import {MailsBundleKey} from "src/web/src/app/store/reducers/db-view";

export const DB_VIEW_ACTIONS = unionize({
        MountInstance: ofType<{
            dbAccountPk: DbAccountPk;
            finishPromise: Promise<void>;
        }>(),
        UnmountInstance: ofType<{
            dbAccountPk: DbAccountPk;
        }>(),
        SetFolders: ofType<{
            dbAccountPk: DbAccountPk;
            folders: { system: View.Folder[]; custom: View.Folder[]; };
        }>(),
        SelectFolder: ofType<{
            dbAccountPk: DbAccountPk;
            selectedFolderData?: Pick<View.Folder, "pk" | "mailFolderId">;
            distinct?: boolean;
        }>(),
        SelectMailRequest: ofType<{
            dbAccountPk: DbAccountPk;
            mailPk: Mail["pk"];
        }>(),
        SelectMail: ofType<{
            dbAccountPk: DbAccountPk;
            value?: {
                listMailPk: Mail["pk"];
                rootNode: View.RootConversationNode;
                conversationMail: Mail;
            };
        }>(),
        SelectConversationMailRequest: ofType<{
            dbAccountPk: DbAccountPk;
            mailPk: Mail["pk"];
        }>(),
        SelectConversationMail: ofType<{
            dbAccountPk: DbAccountPk;
            conversationMail: Mail;
        }>(),
        SortMails: ofType<{
            dbAccountPk: DbAccountPk;
            mailsBundleKey: MailsBundleKey;
            sorterIndex: number;
        }>(),
        Paging: ofType<{
            dbAccountPk: DbAccountPk;
            mailsBundleKey: MailsBundleKey;
            reset?: boolean;
            noIncrement?: boolean;
        }>(),
        FullTextSearchRequest: ofType<Arguments<Endpoints["dbFullTextSearch"]>[0]>(),
        FullTextSearch: ofType<{
            dbAccountPk: DbAccountPk;
            value: Unpacked<ReturnType<Endpoints["dbFullTextSearch"]>>;
        }>(),
        ResetSearchMailsBundleItems: ofType<{
            dbAccountPk: DbAccountPk;
        }>(),
    },
    {
        tag: "type",
        value: "payload",
        tagPrefix: "db-view:",
    },
);
