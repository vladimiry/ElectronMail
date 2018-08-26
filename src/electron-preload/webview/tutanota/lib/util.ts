import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "./rest";
import {BaseEntity, Id, IdTuple} from "./rest/model";
import {curryFunctionMembers, MailFolderTypeService} from "src/shared/util";
import {resolveWebClientApi} from "./tutanota-api";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, "[lib/util]");

export function filterUserMailMemberships(user: Rest.Model.User): Rest.Model.GroupMembership[] {
    return user.memberships.filter(({groupType}) => groupType === Rest.Model.GroupType.Mail);
}

export async function fetchMailFoldersWithSubFolders(user: Rest.Model.User): Promise<Rest.Model.MailFolder[]> {
    const logger = curryFunctionMembers(_logger, "fetchMailFoldersWithSubFolders()", JSON.stringify({callId: +new Date()}));
    logger.info();

    const folders: Rest.Model.MailFolder[] = [];
    const userMailGroups = user.memberships.filter(({groupType}) => groupType === Rest.Model.GroupType.Mail);

    for (const {group} of userMailGroups) {
        const {mailbox} = await Rest.fetchEntity(Rest.Model.MailboxGroupRootTypeRef, group);
        const {systemFolders} = await Rest.fetchEntity(Rest.Model.MailBoxTypeRef, mailbox);

        if (!systemFolders) {
            continue;
        }

        for (const folder of await Rest.fetchEntitiesList(Rest.Model.MailFolderTypeRef, systemFolders.folders)) {
            folders.push(folder);
            folders.push(...await Rest.fetchEntitiesList(Rest.Model.MailFolderTypeRef, folder.subFolders));
        }
    }

    logger.verbose(`fetched ${folders.length} folders`);

    return folders;
}

export async function buildDbMail(mail: Rest.Model.Mail): Promise<DatabaseModel.Mail> {
    const [body, files] = await Promise.all([
        Rest.fetchEntity(Rest.Model.MailBodyTypeRef, mail.body),
        Promise.all(mail.attachments.map((id) => Rest.fetchEntity(Rest.Model.FileTypeRef, id))),
    ]);

    return buildDbMailModel(mail, body, files);
}

export function buildPk<T extends Rest.Model.IdTuple | Rest.Model.Id>(id: T): DatabaseModel.Mail["pk"] {
    return JSON.stringify(id);
}

function buildDbMailModel(input: Rest.Model.Mail, body: Rest.Model.MailBody, files: Rest.Model.File[]): DatabaseModel.Mail {
    return {
        pk: buildPk(input._id),
        raw: JSON.stringify(input),
        id: resolveInstanceId(input),
        date: Number(input.receivedDate), // TODO consider calling "generatedIdToTimestamp" on "mail._id[1]"
        subject: input.subject,
        body: body.text,
        sender: buildDbAddressModel(input.sender),
        toRecipients: input.toRecipients.map(buildDbAddressModel),
        ccRecipients: input.ccRecipients.map(buildDbAddressModel),
        bccRecipients: input.bccRecipients.map(buildDbAddressModel),
        attachments: files.map(buildDbFileModel),
        unread: Boolean(input.unread),
    };
}

function buildDbAddressModel(input: Rest.Model.MailAddress): DatabaseModel.MailAddress {
    return {
        pk: buildPk(input._id),
        raw: JSON.stringify(input),
        id: resolveInstanceId(input),
        name: input.name,
        address: input.address,
    };
}

function buildDbFileModel(input: Rest.Model.File): DatabaseModel.File {
    return {
        pk: buildPk(input._id),
        raw: JSON.stringify(input),
        id: resolveInstanceId(input),
        mimeType: input.mimeType,
        name: input.name,
        size: Number(input.size),
    };
}

export function buildDbFolder(input: Rest.Model.MailFolder): DatabaseModel.Folder {
    return {
        pk: buildPk(input._id),
        raw: JSON.stringify(input),
        id: resolveInstanceId(input),
        folderType: MailFolderTypeService.parseValueStrict(input.folderType),
        name: input.name,
    };
}

export async function generateStartId(id?: Rest.Model.Id): Promise<Rest.Model.Id> {
    const api = await resolveWebClientApi();
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

export function instanceIdComparator<T extends BaseEntity<Id | IdTuple>>(a: T, b: T) {
    const aId = resolveInstanceId(a);
    const bId = resolveInstanceId(b);
    if (aId > bId) {
        return 1;
    }
    if (aId < bId) {
        return -1;
    }
    return 0;
}
