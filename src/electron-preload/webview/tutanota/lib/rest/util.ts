import * as DatabaseModel from "src/shared/model/database/index";
import * as Rest from ".";
import {BaseEntity, Id, IdTuple} from "./model";
import {GROUP_TYPE} from "./model/constants";
import {Unpacked} from "src/shared/types";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {curryFunctionMembers} from "src/shared/util";
import {resolveApi} from "src/electron-preload/webview/tutanota/lib/api";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, "[lib/util]");

export const filterSyncingMemberships = ((types: Set<string>) => ({memberships}: Rest.Model.User): Rest.Model.GroupMembership[] => {
    return memberships.filter(({groupType}) => types.has(groupType));
})(new Set([GROUP_TYPE.Mail, GROUP_TYPE.Contact]));

export const isUpsertOperationType = ((types: Set<string>) => (type: Unpacked<typeof DatabaseModel.OPERATION_TYPE._.values>): boolean => {
    return types.has(type);
})(new Set([DatabaseModel.OPERATION_TYPE.CREATE, DatabaseModel.OPERATION_TYPE.UPDATE]));

export async function fetchMailFoldersWithSubFolders(user: Rest.Model.User): Promise<Rest.Model.MailFolder[]> {
    const logger = curryFunctionMembers(_logger, "fetchMailFoldersWithSubFolders()", JSON.stringify({callId: +new Date()}));
    logger.info();

    const folders: Rest.Model.MailFolder[] = [];
    const mailMemberships = user.memberships.filter(({groupType}) => groupType === GROUP_TYPE.Mail);

    for (const {group} of mailMemberships) {
        const {mailbox} = await Rest.fetchEntity(Rest.Model.MailboxGroupRootTypeRef, group);
        const {systemFolders} = await Rest.fetchEntity(Rest.Model.MailBoxTypeRef, mailbox);

        if (!systemFolders) {
            continue;
        }

        for (const folder of await Rest.fetchEntities(Rest.Model.MailFolderTypeRef, systemFolders.folders)) {
            folders.push(folder);
            folders.push(...await Rest.fetchEntities(Rest.Model.MailFolderTypeRef, folder.subFolders));
        }
    }

    logger.verbose(`fetched ${folders.length} folders`);

    return folders;
}

export async function generateStartId(id?: Rest.Model.Id): Promise<Rest.Model.Id> {
    const api = await resolveApi();
    const {FULL_INDEXED_TIMESTAMP: TIMESTAMP_MIN} = api["src/api/common/TutanotaConstants"];
    const {timestampToGeneratedId, generatedIdToTimestamp} = api["src/api/common/utils/Encoding"];
    const startTimestamp = typeof id === "undefined" ? TIMESTAMP_MIN : generatedIdToTimestamp(id) + 1;

    return timestampToGeneratedId(startTimestamp);
}

export function sameRefType<T extends Rest.Model.BaseEntity<Rest.Model.Id | Rest.Model.IdTuple>, R extends Rest.Model.TypeRef<T>>(
    refType: R,
    {application, type}: Rest.Model.EntityUpdate,
): boolean {
    return refType.app === application && refType.type === type;
}

export function resolveInstanceId<T extends BaseEntity<Id | IdTuple>>(entity: T): Id {
    return Array.isArray(entity._id) ? entity._id[1] : entity._id;
}

export function resolveListId<T extends BaseEntity<IdTuple>>(entity: T): Id {
    if (!Array.isArray(entity._id) || entity._id.length !== 2) {
        throw new Error(`"_id" of the entity is not "IdTuple"/array`);
    }
    return entity._id[0];
}
