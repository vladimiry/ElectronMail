import electronLog from "electron-log";
import sanitizeHtml from "sanitize-html";
import {Observable, from} from "rxjs";
import {app, dialog} from "electron";
import {equals, mergeDeepRight, omit} from "ramda";

import {Arguments, Unpacked} from "src/shared/types";
import {Context} from "src/electron-main/model";
import {Endpoints, IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {EntityMap, MemoryDbAccount} from "src/shared/model/database";
import {NOTIFICATION_SUBJECT} from "src/electron-main/api/constants";
import {curryFunctionMembers, isEntityUpdatesPatchNotEmpty} from "src/shared/util";
import {prepareFoldersView} from "./folders-view";
import {writeEmlFile} from "./export";

const _logger = curryFunctionMembers(electronLog, "[electron-main/api/endpoints-builders/database]");

type Methods =
    | "dbPatch"
    | "dbGetAccountMetadata"
    | "dbGetAccountDataView"
    | "dbGetAccountMail"
    | "dbExport";

export async function buildEndpoints(ctx: Context): Promise<Pick<Endpoints, Methods>> {
    return {
        dbPatch: ({type, login, metadata: metadataPatch, forceFlush, patch: entityUpdatesPatch}) => from((async (
            logger = curryFunctionMembers(_logger, "dbPatch()"),
        ) => {
            logger.info();

            const key = {type, login};
            const account = ctx.db.getAccount(key) || ctx.db.initAccount(key);
            const entityTypes: ["conversationEntries", "mails", "folders", "contacts"]
                = ["conversationEntries", "mails", "folders", "contacts"];

            for (const entityType of entityTypes) {
                const source = entityUpdatesPatch[entityType];
                const destinationMap = account[entityType];

                source.remove.forEach(({pk}) => destinationMap.delete(pk));

                for (const entity of source.upsert) {
                    await (destinationMap as EntityMap<typeof entity>).validateAndSet(entity);
                }
            }

            const entitiesModified = isEntityUpdatesPatchNotEmpty(entityUpdatesPatch);
            const metadataModified = patchMetadata(account.metadata, metadataPatch);
            const modified = entitiesModified || metadataModified;

            logger.verbose(JSON.stringify({entitiesModified, metadataModified, modified, forceFlush}));

            if (modified || forceFlush) {
                await ctx.db.saveToFile();
            }

            NOTIFICATION_SUBJECT.next(IPC_MAIN_API_NOTIFICATION_ACTIONS.DbPatchAccount({
                key,
                entitiesModified,
                metadataModified,
                stat: ctx.db.accountStat(account),
            }));

            return account.metadata;
        })()),

        dbGetAccountMetadata: ({type, login}) => from((async (
            logger = curryFunctionMembers(_logger, "dbGetAccountMetadata()"),
        ) => {
            logger.info("dbGetAccountMetadata()");
            const account = ctx.db.getAccount({type, login});
            return account ? account.metadata : null;
        })()),

        dbGetAccountDataView: ({type, login}) => from((async (
            logger = curryFunctionMembers(_logger, "dbGetAccountDataView()"),
        ) => {
            logger.info();

            const account = ctx.db.getFsAccount({type, login});

            if (!account) {
                return undefined;
            }

            return {
                folders: prepareFoldersView(account),
                contacts: account.contacts,
            };
        })()),

        dbGetAccountMail: ({type, login, pk}) => from((async (
            logger = curryFunctionMembers(_logger, "dbGetAccountMail()"),
        ) => {
            logger.info();

            const account = ctx.db.getFsAccount({type, login});

            if (!account) {
                throw new Error(`Failed to resolve account by the provided "type/login"`);
            }

            const mail = account.mails[pk];

            if (!mail) {
                throw new Error(`Failed to resolve mail by the provided "pk"`);
            }

            return {
                ...omit(["body"], mail),
                // TODO test "dbGetAccountMail" setting "mail.body" through the "sanitizeHtml" call
                body: sanitizeHtml(mail.body),
            };
        })()),

        dbExport: ({type, login}) => ((
            logger = curryFunctionMembers(_logger, "dbExport()"),
        ) => new Observable<Unpacked<ReturnType<Endpoints["dbExport"]>>>((subscriber) => {
            logger.info();

            const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;
            if (!browserWindow) {
                return subscriber.error(new Error(`Failed to resolve main app window`));
            }

            const [dir]: Array<string | undefined> = dialog.showOpenDialog(
                browserWindow,
                {
                    title: "Select directory to export emails to the EML files",
                    defaultPath: app.getPath("home"),
                    properties: ["openDirectory"],
                },
            ) || [];

            if (!dir) {
                return subscriber.complete();
            }

            const account = ctx.db.getFsAccount({type, login});

            if (!account) {
                return subscriber.error(new Error(`Failed to resolve account by the provided "type/login"`));
            }

            const mails = Object.values(account.mails);
            const count = mails.length;

            subscriber.next({count});

            const promise = (async () => {
                for (let index = 0; index < count; index++) {
                    const {file} = await writeEmlFile(mails[index], dir);
                    subscriber.next({file, progress: +((index + 1) / count * 100).toFixed(2)});
                }
            })();

            promise
                .then(() => subscriber.complete())
                .catch((error) => subscriber.error(error));
        }))(),
    };
}

function patchMetadata(
    dest: MemoryDbAccount["metadata"],
    patch: Arguments<Unpacked<ReturnType<typeof buildEndpoints>>["dbPatch"]>[0]["metadata"],
    logger = curryFunctionMembers(_logger, "patchMetadata()"),
): boolean {
    logger.info();

    const merged = mergeDeepRight(dest, patch);

    // console.log(JSON.stringify({dest, patch, merged}, null, 2));

    if (equals(dest, merged)) {
        return false;
    }

    Object.assign(dest, merged);

    logger.verbose(`metadata patched with ${JSON.stringify(Object.keys(patch))} properties`);

    return true;
}
