import _logger from "electron-log";
import PQueue from "p-queue";
import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/private/constants";
import {EncryptionAdapter, KeyBasedPreset} from "fs-json-store-encryption-adapter";
import {Model, Store} from "fs-json-store";

import * as Entity from "./entity";
import {AccountType} from "src/shared/model/account";
import {EntityMap} from "./entity-map";
import {FsDb, FsDbAccount, MemoryDb, MemoryDbAccount} from "src/shared/model/database";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[database]");

// TODO consider dropping Map-bsed databse use ("MemoryDb"), ie use ony pupre JSON-based "FsDb"
export class Database {

    private memoryDb: MemoryDb = this.buildEmptyDatabase();

    private saveToFileQueue: PQueue<PQueue.DefaultAddOptions>;

    constructor(
        public readonly options: Readonly<{
            file: string;
            fileFs?: Model.StoreFs;
            encryption: Readonly<{
                keyResolver: () => Promise<string>;
                presetResolver: () => Promise<KeyBasedPreset>;
            }>
        }>,
    ) {
        this.saveToFileQueue = new PQueue({concurrency: 1});
    }

    buildEmptyDatabase<T extends MemoryDb | FsDb>(): T {
        return {tutanota: {}, protonmail: {}} as T;
    }

    buildEmptyAccountMetadata<T extends keyof MemoryDb>(type: T): MemoryDbAccount<T>["metadata"] {
        const metadata: { [key in keyof MemoryDb]: MemoryDbAccount<key>["metadata"] } = {
            tutanota: {type: "tutanota", groupEntityEventBatchIds: {}},
            protonmail: {type: "protonmail"},
        };
        return metadata[type];
    }

    getFsAccount<TL extends { type: keyof MemoryDb, login: string }>({type, login}: TL): FsDbAccount<TL["type"]> | undefined {
        const account = this.getAccount({type, login});

        if (!account) {
            return;
        }

        return this.memoryAccountToFsAccount(account);
    }

    getAccount<TL extends { type: keyof MemoryDb, login: string }>({type, login}: TL): MemoryDbAccount<TL["type"]> | undefined {
        const account = this.memoryDb[type][login];

        if (!account) {
            return;
        }

        return account;
    }

    initAccount<TL extends { type: keyof MemoryDb, login: string }>({type, login}: TL): MemoryDbAccount<TL["type"]> {
        const account = {
            mails: new EntityMap(Entity.Mail),
            folders: new EntityMap(Entity.Folder),
            contacts: new EntityMap(Entity.Contact),
            metadata: this.buildEmptyAccountMetadata(type) as any,
        };

        this.memoryDb[type][login] = account;

        return account;
    }

    deleteAccount<TL extends { type: keyof MemoryDb, login: string }>({type, login}: TL): void {
        delete this.memoryDb[type][login];
    }

    async persisted(): Promise<boolean> {
        return (await this.resolveStore()).readable();
    }

    async loadFromFile(): Promise<void> {
        logger.info("loadFromFile()");

        const startTime = Number(new Date());
        const store = await this.resolveStore();
        const source = await store.readExisting();
        const target: MemoryDb = this.buildEmptyDatabase();

        // fs => memory
        for (const type of Object.keys(source) as Array<keyof typeof source>) {
            const loginBundle = source[type];
            Object.keys(loginBundle).map((login) => {
                target[type][login] = this.fsAccountToMemoryAccount(loginBundle[login]);
            });
        }

        this.memoryDb = target;

        logger.verbose(`loadFromFile().stat: ${JSON.stringify({...this.stat(), time: Number(new Date()) - startTime})}`);
    }

    async saveToFile(): Promise<FsDb> {
        logger.info("saveToFile()");

        return this.saveToFileQueue.add(async () => {
            const startTime = Number(new Date());
            const store = await this.resolveStore();
            const dump = this.dump();
            const result = await store.write(dump);

            logger.verbose(`saveToFile().stat: ${JSON.stringify({...this.stat(), time: Number(new Date()) - startTime})}`);

            return result;
        });
    }

    dump(): FsDb {
        logger.info("dump()");

        const {memoryDb: source} = this;
        const target: FsDb = this.buildEmptyDatabase();

        // memory => fs
        for (const type of Object.keys(source) as Array<keyof typeof source>) {
            const loginBundle = source[type];
            Object.keys(loginBundle).map((login) => {
                target[type][login] = this.memoryAccountToFsAccount(loginBundle[login]);
            });
        }

        return target;
    }

    reset() {
        this.memoryDb = this.buildEmptyDatabase();
    }

    stat(): { records: number, mails: number, folders: number, contacts: number } {
        logger.info("stat()");

        const {memoryDb: source} = this;
        const stat = {records: 0, mails: 0, folders: 0, contacts: 0};

        for (const type of Object.keys(source) as AccountType[]) {
            const loginBundle = source[type];
            Object.keys(loginBundle).map((login) => {
                stat.records++;
                const {mails, folders, contacts} = this.accountStat(loginBundle[login]);
                stat.mails += mails;
                stat.folders += folders;
                stat.contacts += contacts;
            });
        }

        return stat;
    }

    accountStat(account: MemoryDbAccount): { mails: number, folders: number; contacts: number } {
        return {
            mails: account.mails.size,
            folders: account.folders.size,
            contacts: account.contacts.size,
        };
    }

    private memoryAccountToFsAccount<T extends keyof MemoryDb>(source: MemoryDbAccount<T>): FsDbAccount<T> {
        return {
            mails: source.mails.toObject(),
            folders: source.folders.toObject(),
            contacts: source.contacts.toObject(),
            metadata: source.metadata as any,
        };
    }

    private fsAccountToMemoryAccount<T extends keyof FsDb>(source: FsDbAccount<T>): MemoryDbAccount<T> {
        return {
            mails: new EntityMap(Entity.Mail, source.mails),
            folders: new EntityMap(Entity.Folder, source.folders),
            contacts: new EntityMap(Entity.Contact, source.contacts),
            metadata: source.metadata as any,
        };
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
