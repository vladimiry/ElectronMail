import _logger from "electron-log";
import {from, of} from "rxjs";

import {AccountType} from "src/shared/model/account";
import {Context} from "src/electron-main/model";
import {Endpoints} from "src/shared/api/main";
import {EntityMap, MemoryDbAccount} from "src/shared/model/database";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[database api]");

type Methods =
    | "dbPatch"
    | "dbGetContentMetadata";

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<Endpoints, Methods>> {
    return {
        dbPatch: ({type, login, metadata, forceFlush, ...rest}) => from((async () => {
            logger.info("dbPatch()");

            const record = ctx.db.getAccount({type, login});
            const state = {recordModified: false};

            for (const entityType of (["mails", "folders", "contacts"] as ["mails", "folders", "contacts"])) {
                const source = rest[entityType];
                const destination = record[entityType];

                source.remove.forEach(({pk}) => {
                    destination.delete(pk);
                    state.recordModified = true;
                });

                for (const entity of source.upsert) {
                    await (destination as EntityMap<typeof entity>).validateAndSet(entity);
                    state.recordModified = true;
                }
            }

            if (patchMetadata(type, record.metadata, metadata)) {
                state.recordModified = true;
            }

            if (state.recordModified || forceFlush) {
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
    dest: MemoryDbAccount["metadata"],
    patch: Partial<MemoryDbAccount["metadata"]>,
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
