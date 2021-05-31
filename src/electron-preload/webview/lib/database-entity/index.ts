import * as DatabaseModel from "src/shared/model/database";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";
import {lzutf8Util} from "src/shared/entity-util";

export {buildContact} from "src/electron-preload/webview/lib/database-entity/contact";
export {buildFolder} from "src/electron-preload/webview/lib/database-entity/folder";
export {buildMail} from "src/electron-preload/webview/lib/database-entity/mail";

export function buildPk<ID extends RestModel.Id>(id: ID): DatabaseModel.Entity["pk"] {
    return id;
}

export function buildBaseEntity<T extends RestModel.Entity>(input: T): NoExtraProps<DatabaseModel.Entity> {
    const raw = JSON.stringify(input);
    const shouldCompressRaw = lzutf8Util.shouldCompress(raw);

    return {
        pk: buildPk(input.ID),
        raw: shouldCompressRaw
            ? lzutf8Util.compress(raw)
            : raw,
        rawCompression: shouldCompressRaw
            ? "lzutf8"
            : undefined,
        id: input.ID,
    };
}
