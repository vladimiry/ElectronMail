import _logger from "electron-log";
import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/private/constants";
import {EncryptionAdapter, KeyBasedPreset} from "fs-json-store-encryption-adapter";
import {Model, Store} from "fs-json-store";

import * as Entity from "./entity";
import {AccountType} from "src/shared/model/account";
import {EntityMap} from "./entity-map";
import {FsDb, MemoryDb, MemoryDbAccount} from "src/shared/model/database";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[database]");

export class Database {

    static empty<T extends MemoryDb | FsDb>(): T {
        return {tutanota: {}, protonmail: {}} as T;
    }

    static emptyAccountMetadata<T extends keyof MemoryDb>(type: T): MemoryDbAccount<T>["metadata"] {
        const metadata: { [key in keyof MemoryDb]: MemoryDbAccount<key>["metadata"] } = {
            tutanota: {type: "tutanota", groupEntityEventBatchIds: {}},
            protonmail: {type: "protonmail"},
        };
        return metadata[type];
    }

    private memoryDb = Database.empty<MemoryDb>();

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

    getAccount<TL extends { type: keyof MemoryDb, login: string }>({type, login}: TL): MemoryDbAccount<TL["type"]> {
        return this.memoryDb[type][login] || this.initAccount({type, login});
    }

    deleteAccount<TL extends { type: keyof MemoryDb, login: string }>({type, login}: TL): void {
        delete this.memoryDb[type][login];
    }

    async persisted(): Promise<boolean> {
        return (await this.resolveStore()).readable();
    }

    async loadFromFile(): Promise<void> {
        logger.info("loadFromFile()");

        const stat = {records: 0, mails: 0, folders: 0, contacts: 0, time: Number(new Date())};
        const store = await this.resolveStore();
        const source = await store.readExisting();
        const target: MemoryDb = Database.empty<MemoryDb>();

        // fs => memory
        for (const type of Object.keys(source) as AccountType[]) {
            const loginBundle = source[type];
            Object.keys(loginBundle).map((login) => {
                const recordBundle = loginBundle[login];
                target[type][login] = {
                    mails: new EntityMap(Entity.Mail, recordBundle.mails),
                    folders: new EntityMap(Entity.Folder, recordBundle.folders),
                    contacts: new EntityMap(Entity.Contact, recordBundle.contacts),
                    metadata: recordBundle.metadata as any,
                };
                stat.records++;
                stat.mails += target[type][login].mails.size;
                stat.folders += target[type][login].folders.size;
                stat.contacts += target[type][login].contacts.size;
            });
        }

        this.memoryDb = target;

        stat.time = Number(new Date()) - stat.time;
        logger.verbose(`loadFromFile(): loaded stat: ${JSON.stringify(stat)}`);
    }

    // TODO queuing saving
    async saveToFile(): Promise<FsDb> {
        logger.info("saveToFile()");

        const store = await this.resolveStore();
        const dump = this.dumpToFsDb();

        return await store.write(dump);
    }

    dumpToFsDb(): FsDb {
        logger.info("dumpToFsDb()");

        const stat = {records: 0, mails: 0, folders: 0, contacts: 0};
        const {memoryDb: source} = this;
        const target = Database.empty<FsDb>();

        // memory => fs
        for (const type of Object.keys(source) as AccountType[]) {
            const loginBundle = source[type];
            Object.keys(loginBundle).map((login) => {
                const recordBundle = loginBundle[login];
                target[type][login] = {
                    mails: recordBundle.mails.toObject(),
                    folders: recordBundle.folders.toObject(),
                    contacts: recordBundle.contacts.toObject(),
                    metadata: recordBundle.metadata as any,
                };
                stat.records++;
                stat.mails += recordBundle.mails.size;
                stat.folders += recordBundle.folders.size;
                stat.contacts += recordBundle.contacts.size;
            });
        }

        logger.verbose(`dumpToFsDb(): stat: ${JSON.stringify(stat)}`);

        return target;
    }

    private initAccount<TL extends { type: keyof MemoryDb, login: string }>({type, login}: TL): MemoryDbAccount<TL["type"]> {
        const record = {
            mails: new EntityMap(Entity.Mail),
            folders: new EntityMap(Entity.Folder),
            contacts: new EntityMap(Entity.Contact),
            metadata: Database.emptyAccountMetadata(type) as any,
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
