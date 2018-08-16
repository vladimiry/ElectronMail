import {from, of} from "rxjs";
import {prop, sortBy} from "ramda";

import {Endpoints} from "src/shared/api/main";
import {Context} from "src/electron-main/model";
import {Mail} from "src/shared/model/database";

type Methods =
    | "dbInsertBootstrapContent"
    | "dbProcessBatchEntityUpdatesPatch"
    | "dbGetContentMetadata";

export async function buildEndpoints(ctx: Context): Promise<Pick<Endpoints, Methods>> {
    return {
        dbInsertBootstrapContent: ({type, login, mails, folders, metadata}) => from((async () => {
            if (type !== "tutanota") {
                throw new Error(`"databaseBootstrapUpsert()": not yet implemented for "${type}" email provider`);
            }

            const record = ctx.db.getAccountContent({type, login});

            for (const mail of mails) {
                await record.mails.set(mail);
            }
            for (const folder of folders) {
                await record.folders.set(folder);
            }

            if (mails.length) {
                const sortByProp = ((instanceIdProp: keyof Pick<Mail, "instanceId">) => instanceIdProp)("instanceId");
                record.metadata.lastBootstrappedMailInstanceId = sortBy(prop(sortByProp))(mails)[mails.length - 1].instanceId;
            }

            if (metadata && "lastGroupEntityEventBatches" in metadata) {
                Object.assign(record.metadata.lastGroupEntityEventBatches, metadata.lastGroupEntityEventBatches);
            }

            return record.metadata;
        })()),

        dbProcessBatchEntityUpdatesPatch: ({type, login, folders, mails, metadata}) => from((async () => {
            if (type !== "tutanota") {
                throw new Error(`"dbProcessBatchEntityUpdatesPatch()": not yet implemented for "${type}" email provider`);
            }

            const record = ctx.db.getAccountContent({type, login});

            folders.remove.forEach(({pk}) => record.folders.delete(pk));
            for (const folder of folders.add) {
                await record.folders.set(folder);
            }

            mails.remove.forEach(({pk}) => record.mails.delete(pk));
            for (const mail of mails.add) {
                await record.mails.set(mail);
            }

            if (metadata && "lastGroupEntityEventBatches" in metadata) {
                Object.assign(record.metadata.lastGroupEntityEventBatches, metadata.lastGroupEntityEventBatches);
            }

            return record.metadata;
        })()),

        dbGetContentMetadata: ({type, login}) => {
            return of(ctx.db.getAccountContent({type, login}).metadata);
        },
    };
}
