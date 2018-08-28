import _logger from "electron-log";
import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/private/constants";
import {EncryptionAdapter, KeyBasedPreset} from "fs-json-store-encryption-adapter";
import {Model, Store} from "fs-json-store";

import * as DbEntities from "./entities";
import {AccountType} from "src/shared/model/account";
import {EntityMap} from "./entity-map";
import {FsDb, MemoryDb} from "src/shared/model/database";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[database]");

export class Database {
    static buildEmptyDb<T extends MemoryDb | FsDb>(): T {
        return {tutanota: {}, protonmail: {}} as T;
    }

    private memoryDb = Database.buildEmptyDb<MemoryDb>();

    constructor(
        public readonly options: Readonly<{
            file: string;
            fileFs?: Model.StoreFs;
            encryption: Readonly<{
                keyResolver: () => Promise<string>;
                presetResolver: () => Promise<KeyBasedPreset>;
            }>
        }>,
    ) {}

    getAccount<TL extends { type: keyof MemoryDb, login: string }>(
        {type, login}: TL,
    ): MemoryDb[TL["type"]][TL["login"]] {
        return this.memoryDb[type][login] || this.initAccount({type, login});
    }

    deleteAccount<TL extends { type: keyof MemoryDb, login: string }>(
        {type, login}: TL,
    ): void {
        delete this.memoryDb[type][login];
    }

    async persisted(): Promise<boolean> {
        return (await this.resolveStore()).readable();
    }

    async loadFromFile(): Promise<void> {
        logger.info("loadFromFile()");

        const stat = {records: 0, folders: 0, mails: 0};
        const store = await this.resolveStore();
        const source = await store.readExisting();
        const target: MemoryDb = Database.buildEmptyDb<MemoryDb>();

        // fs => memory
        for (const type of Object.keys(source) as AccountType[]) {
            const loginBundle = source[type];
            Object.keys(loginBundle).map((login) => {
                const recordBundle = loginBundle[login];
                target[type][login] = {
                    folders: new EntityMap(DbEntities.Folder, recordBundle.folders),
                    mails: new EntityMap(DbEntities.Mail, recordBundle.mails),
                    metadata: recordBundle.metadata as any,
                };
                stat.records++;
                stat.folders += target[type][login].folders.size;
                stat.mails += target[type][login].mails.size;
            });
        }

        this.memoryDb = target;

        logger.verbose(`loadFromFile(): loaded stat: ${JSON.stringify(stat)}`);
    }

    async saveToFile(): Promise<FsDb> {
        logger.info("saveToFile()");
        const store = await this.resolveStore();
        return await store.write(this.dumpToFsDb());
    }

    dumpToFsDb(): FsDb {
        logger.info("dumpToFsDb()");

        const stat = {records: 0, folders: 0, mails: 0};
        const {memoryDb: source} = this;
        const target = Database.buildEmptyDb<FsDb>();

        // memory => fs
        for (const type of Object.keys(source) as AccountType[]) {
            const loginBundle = source[type];
            Object.keys(loginBundle).map((login) => {
                const recordBundle = loginBundle[login];
                target[type][login] = {
                    folders: recordBundle.folders.toObject(),
                    mails: recordBundle.mails.toObject(),
                    metadata: recordBundle.metadata as any,
                };
                stat.records++;
                stat.folders += recordBundle.folders.size;
                stat.mails += recordBundle.mails.size;
            });
        }

        logger.verbose(`dumpToFsDb(): stat: ${JSON.stringify(stat)}`);

        return target;
    }

    private initAccount<TL extends { type: keyof MemoryDb, login: string }>(
        {type, login}: TL,
    ): MemoryDb[TL["type"]][TL["login"]] {
        const metadata: { [key in keyof MemoryDb]: MemoryDb[key][string]["metadata"] } = {
            tutanota: {type: "tutanota", groupEntityEventBatchIds: {}},
            protonmail: {type: "protonmail"},
        };
        const record = {
            mails: new EntityMap(DbEntities.Mail),
            folders: new EntityMap(DbEntities.Folder),
            metadata: metadata[type] as any,
        };

        this.memoryDb[type][login] = record;

        return record;
    }

    private async resolveStore(): Promise<Store<FsDb>> {
        const key = Buffer.from(await this.options.encryption.keyResolver(), BASE64_ENCODING);

        if (key.length !== KEY_BYTES_32) {
            throw new Error(`Invalid encryption key length, expected: ${KEY_BYTES_32}, actual: ${key.length}`);
        }

        return new Store<FsDb>({
            file: this.options.file,
            adapter: new EncryptionAdapter({
                key,
                preset: await this.options.encryption.presetResolver(),
            }),
            fs: this.options.fileFs,
        });
    }
}
