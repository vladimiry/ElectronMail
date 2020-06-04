import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "./rest";
import {BaseEntity, Id, IdTuple} from "./rest/model";
import {GROUP_TYPE} from "./rest/model/constants";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {buildDbPatchRetryPipeline} from "src/electron-preload/webview/util";
import {curryFunctionMembers} from "src/shared/util";
import {resolveProviderApi} from "src/electron-preload/webview/tutanota/lib/provider-api";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, "[lib/util]");

export const filterSyncingMemberships = ((types: Set<string>) => ({memberships}: Rest.Model.User): Rest.Model.GroupMembership[] => {
    return memberships.filter(({groupType}) => types.has(groupType));
})(new Set([GROUP_TYPE.Mail, GROUP_TYPE.Contact]));

export const isUpsertOperationType: (v: Unpacked<typeof DatabaseModel.OPERATION_TYPE._.values>) => boolean = (() => {
    const types: ReadonlySet<Parameters<typeof isUpsertOperationType>[0]> = new Set(
        [
            DatabaseModel.OPERATION_TYPE.CREATE,
            DatabaseModel.OPERATION_TYPE.UPDATE,
        ],
    );
    const result: typeof isUpsertOperationType = (type) => types.has(type);
    return result;
})();

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

        for (const folder of await Rest.fetchAllEntities(Rest.Model.MailFolderTypeRef, systemFolders.folders)) {
            folders.push(folder);
            folders.push(...await Rest.fetchAllEntities(Rest.Model.MailFolderTypeRef, folder.subFolders));
        }
    }

    logger.verbose(`fetched ${folders.length} folders`);

    return folders;
}

export async function generateStartId(id?: Rest.Model.Id): Promise<Rest.Model.Id> {
    const api = await resolveProviderApi();
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

export function getUserController(): { accessToken: string, user: Rest.Model.User } | null {
    const {tutao} = window;
    const userController = (
        tutao
        &&
        tutao.logins
        &&
        tutao.logins.getUserController
        &&
        tutao.logins.getUserController()
    );

    return userController
        ? userController
        : null;
}

export function isLoggedIn(): boolean {
    const userController = getUserController();

    return !!(
        userController
        &&
        userController.accessToken
        &&
        userController.accessToken.length
    );
}

export function isUpsertUpdate(update: Rest.Model.EntityUpdate) {
    return isUpsertOperationType(update.operation);
}

export const preprocessError: Parameters<typeof buildDbPatchRetryPipeline>[0] = (rawError: any) => {
    const {name, message}: { name?: unknown; message?: unknown } = Object(rawError);
    const retriable = (
        !navigator.onLine
        ||
        name === "ConnectionError"
        ||
        String(message).includes("ConnectionError:")
        ||
        String(message).includes("Reached timeout")
        ||
        (name === "ServiceUnavailableError" && String(message).startsWith("503"))
    );

    for (const prop in Object(rawError)) {
        if (Object(rawError).hasOwnProperty(prop) && typeof rawError[prop] === "string") {
            rawError[prop] = depersonalizeLoggedData(rawError[prop]);
        }
    }

    rawError.stack = depersonalizeLoggedData(
        String(rawError.stack),
    );

    return {
        error: rawError,
        retriable,
        skippable: retriable,
    };
};

export function depersonalizeLoggedData(value: string): string {
    // tutanota's IDs include normally include "/sdfjbjsdfjh----1" | "sdfjbjsdfjh-2s-0";
    const mapSubPart = (subPart: string) => {
        const sensitive = /-[\d]+$/.test(
            String(subPart)
                .replace(/[\r\t\n]/g, ""),
        );
        return sensitive
            ? "<wiped-out>"
            : subPart;
    };
    return value
        .split("/")
        .map((part) => {
            return /-[\d]+/.test(part)
                ? part
                    .split(" ")
                    .map(mapSubPart)
                    .join(" ")
                : part;
        })
        .join("/");
}
