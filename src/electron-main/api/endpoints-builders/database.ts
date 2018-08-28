import _logger from "electron-log";
import {from, of} from "rxjs";

import {AccountType} from "src/shared/model/account";
import {Context} from "src/electron-main/model";
import {DbContent} from "src/shared/model/database";
import {Endpoints} from "src/shared/api/main";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[database api]");

type Methods =
    | "dbPatch"
    | "dbGetContentMetadata";

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<Endpoints, Methods>> {
    return {
        dbPatch: ({type, login, folders, mails, metadata, forceFlush}) => from((async () => {
            logger.info("dbPatch()");

            const record = ctx.db.getAccount({type, login});
            // TODO watch for record changing using observable/proxy/AOP approach
            let recordModified = false;

            folders.remove.forEach(({pk}) => {
                record.folders.delete(pk);
                recordModified = true;
            });
            for (const folder of folders.upsert) {
                await record.folders.validateAndSet(folder);
                recordModified = true;
            }

            mails.remove.forEach(({pk}) => {
                record.mails.delete(pk);
                recordModified = true;
            });
            for (const mail of mails.upsert) {
                await record.mails.validateAndSet(mail);
                recordModified = true;
            }

            if (patchMetadata(type, record.metadata, metadata)) {
                recordModified = true;
            }

            if (recordModified || forceFlush) {
                await ctx.db.saveToFile();
            }

            return record.metadata;
        })()),

        dbGetContentMetadata: ({type, login}) => {
            logger.info("dbGetContentMetadata()");
            return of(ctx.db.getAccount({type, login}).metadata);
        },
    };
}

export function patchMetadata(
    type: AccountType,
    dest: DbContent["metadata"],
    patch: Partial<DbContent["metadata"]>,
): boolean {
    logger.verbose("patchMetadata()");

    if (type !== "tutanota") {
        throw new Error(`"patchMetadata()": not yet implemented for "${type}" email provider`);
    }

    if (!("groupEntityEventBatchIds" in patch) || !patch.groupEntityEventBatchIds) {
        return false;
    }

    const patchSize = Object.keys(patch.groupEntityEventBatchIds).length;

    if (!patchSize) {
        return false;
    }

    Object.assign(
        (dest as typeof patch).groupEntityEventBatchIds,
        patch.groupEntityEventBatchIds,
    );
    logger.verbose(
        "patchMetadata()",
        `"metadata.groupEntityEventBatchIds" patched with ${patchSize} records`,
    );

    return true;
}
