import {IpcMainApiEndpoints, IpcMainServiceScan} from "src/shared/api/main-process";
import {Mail, View} from "src/shared/model/database";
import {MailsBundleKey, SearchMailsBundleKey} from "src/web/browser-window/app/store/reducers/db-view";
import {WebAccountIndexProp, WebAccountPk} from "src/web/browser-window/app/model";
import {props, propsRecordToActionsRecord} from "src/shared/ngrx-util";

export const DB_VIEW_ACTIONS = propsRecordToActionsRecord(
    {
        MountInstance: props<{
            webAccountPk: WebAccountPk;
            finishPromise: Promise<void>;
        }>(),
        UnmountInstance: props<{
            webAccountPk: WebAccountPk;
        }>(),
        SetFolders: props<{
            webAccountPk: WebAccountPk;
            folders: { system: View.Folder[]; custom: View.Folder[] };
        }>(),
        SelectFolder: props<{
            webAccountPk: WebAccountPk;
            selectedFolderData?: Pick<View.Folder, "id">;
            distinct?: boolean;
        }>(),
        SelectMailRequest: props<{
            webAccountPk: WebAccountPk;
            mailPk: Mail["pk"];
        }>(),
        SelectMail: props<{
            webAccountPk: WebAccountPk;
            value?: {
                listMailPk: Mail["pk"];
                rootNode: View.RootConversationNode;
                conversationMail: Mail;
            };
        }>(),
        DbExport: props<NoExtraProps<DeepReadonly<IpcMainServiceScan["ApiImplArgs"]["dbExport"][0] & WebAccountIndexProp>>>(),
        SelectConversationMailRequest: props<{
            webAccountPk: WebAccountPk;
            mailPk: Mail["pk"];
        }>(),
        SelectConversationMail: props<{
            webAccountPk: WebAccountPk;
            conversationMail: Mail;
        }>(),
        SortMails: props<{
            webAccountPk: WebAccountPk;
            mailsBundleKey: MailsBundleKey;
            sorterIndex: number;
        }>(),
        Paging: props<{
            webAccountPk: WebAccountPk;
            mailsBundleKey: MailsBundleKey;
            reset?: boolean;
            noIncrement?: boolean;
        }>(),
        FullTextSearchRequest: props<Parameters<IpcMainApiEndpoints["dbFullTextSearch"]>[0] & WebAccountIndexProp>(),
        FullTextSearch: props<{
            webAccountPk: WebAccountPk;
            value: Unpacked<ReturnType<IpcMainApiEndpoints["dbFullTextSearch"]>>;
        }>(),
        ResetSearchMailsBundleItems: props<{
            webAccountPk: WebAccountPk;
            mailsBundleKey: SearchMailsBundleKey;
        }>(),
    },
    {prefix: __filename},
);
