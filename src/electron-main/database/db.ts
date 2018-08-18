import * as DbEntities from "./entities";
import {DbContentIntersection, Folder, Mail} from "src/shared/model/database";
import {EntityMap} from "./entity-map";

export class Db {
    constructor(
        private readonly content: DbContentIntersection = {
            tutanota: {},
            protonmail: {},
        },
    ) {}

    getAccountContent<TL extends { type: keyof DbContentIntersection, login: string }>(
        {type, login}: TL,
    ): DbContentIntersection[TL["type"]][TL["login"]] {
        return this.content[type][login] || this.initAccountContent({type, login});
    }

    deleteAccountContent<TL extends { type: keyof DbContentIntersection, login: string }>(
        {type, login}: TL,
    ): void {
        delete this.content[type][login];
    }

    private initAccountContent<TL extends { type: keyof DbContentIntersection, login: string }>(
        {type, login}: TL,
    ): DbContentIntersection[TL["type"]][TL["login"]] {
        const metadatas: { [key in keyof DbContentIntersection]: DbContentIntersection[key][string]["metadata"] } = {
            tutanota: {type: "tutanota", groupEntityEventBatchIds: {}},
            protonmail: {type: "protonmail"},
        };

        this.content[type][login] = {
            mails: new EntityMap<Mail["pk"], Mail>(DbEntities.Mail),
            folders: new EntityMap<Folder["pk"], Folder>(DbEntities.Folder),
            metadata: metadatas[type] as any,
        };

        return this.content[type][login];
    }
}
