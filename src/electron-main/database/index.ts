import _logger from "electron-log";
import PQueue from "p-queue";
import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/private/constants";
import {EncryptionAdapter, KeyBasedPreset} from "fs-json-store-encryption-adapter";
import {Model as FsJsonStoreModel, Store as FsJsonStore} from "fs-json-store";

import * as Entity from "./entity";
import {DATABASE_VERSION} from "./constants";
import {DbAccountPk, FsDb, FsDbAccount, MAIL_FOLDER_TYPE, Mail, MemoryDb, MemoryDbAccount} from "src/shared/model/database";
import {EntityMap} from "./entity-map";
import {curryFunctionMembers} from "src/shared/util";
import {resolveMemoryAccountFolders} from "./util";

const logger = curryFunctionMembers(_logger, "[electron-main/database]");

// TODO consider dropping Map-based database use ("MemoryDb"), ie use ony pupe JSON-based "FsDb"
export class Database {
    static buildEmptyDatabase<T extends MemoryDb | FsDb>(): T {
        return {
            version: DATABASE_VERSION,
            accounts: {tutanota: {}, protonmail: {}},
        } as T;
    }

    static buildEmptyAccountMetadata<T extends keyof MemoryDb["accounts"]>(type: T): MemoryDbAccount<T>["metadata"] {
        const metadata: { [key in keyof MemoryDb["accounts"]]: MemoryDbAccount<key>["metadata"] } = {
            tutanota: {type: "tutanota", groupEntityEventBatchIds: {}},
            protonmail: {type: "protonmail"},
        };
        return metadata[type];
    }

    private static memoryAccountToFsAccount<T extends keyof MemoryDb["accounts"]>(source: MemoryDbAccount<T>): FsDbAccount<T> {
        return {
            conversationEntries: source.conversationEntries.toObject(),
            mails: source.mails.toObject(),
            folders: source.folders.toObject(),
            contacts: source.contacts.toObject(),
            metadata: source.metadata as any,
        };
    }

    private static fsAccountToMemoryAccount<T extends keyof FsDb["accounts"]>(source: FsDbAccount<T>): MemoryDbAccount<T> {
        return {
            conversationEntries: new EntityMap(Entity.ConversationEntry, source.conversationEntries),
            mails: new EntityMap(Entity.Mail, source.mails),
            folders: new EntityMap(Entity.Folder, source.folders),
            contacts: new EntityMap(Entity.Contact, source.contacts),
            metadata: source.metadata as any,
        };
    }

    private memoryDb: MemoryDb = Database.buildEmptyDatabase();

    private saveToFileQueue: PQueue<PQueue.DefaultAddOptions> = new PQueue({concurrency: 1});

    constructor(
        public readonly options: Readonly<{
            file: string;
            fileFs?: FsJsonStoreModel.StoreFs;
            encryption: Readonly<{
                keyResolver: () => Promise<string>;
                presetResolver: () => Promise<KeyBasedPreset>;
            }>
        }>,
    ) {}

    getVersion(): string {
        return this.memoryDb.version;
    }

    getFsAccount<TL extends DbAccountPk>({type, login}: TL): FsDbAccount<TL["type"]> | undefined {
        const account = this.getAccount({type, login});

        if (!account) {
            return;
        }

        return Database.memoryAccountToFsAccount(account);
    }

    getAccount<TL extends DbAccountPk>({type, login}: TL): MemoryDbAccount<TL["type"]> | undefined {
        const account = this.memoryDb.accounts[type][login];

        if (!account) {
            return;
        }

        return account;
    }

    initAccount<TL extends DbAccountPk>({type, login}: TL): MemoryDbAccount<TL["type"]> {
        const account = {
            conversationEntries: new EntityMap(Entity.ConversationEntry),
            mails: new EntityMap(Entity.Mail),
            folders: new EntityMap(Entity.Folder),
            contacts: new EntityMap(Entity.Contact),
            metadata: Database.buildEmptyAccountMetadata(type) as any,
        };

        this.memoryDb.accounts[type][login] = account;

        return account;
    }

    iterateAccounts(cb: (data: { account: MemoryDbAccount; pk: DbAccountPk }) => void): void {
        logger.info("iterateAccounts()");

        const accounts = this.memoryDb.accounts;

        for (const type of Object.keys(accounts) as Array<keyof typeof accounts>) {
            const loginBundle = accounts[type];
            Object.keys(loginBundle).forEach((login) => cb({account: loginBundle[login], pk: {type, login}}));
        }
    }

    deleteAccount<TL extends DbAccountPk>({type, login}: TL): void {
        delete this.memoryDb.accounts[type][login];
    }

    async persisted(): Promise<boolean> {
        return (await this.resolveStore()).readable();
    }

    async loadFromFile(): Promise<void> {
        logger.info("loadFromFile()");

        const start = process.hrtime();
        const store = await this.resolveStore();
        const source = await store.readExisting();
        const target: MemoryDb = Database.buildEmptyDatabase();

        target.version = source.version;

        // fs => memory
        for (const type of Object.keys(source.accounts) as Array<keyof typeof source.accounts>) {
            const loginBundle = source.accounts[type];
            Object.keys(loginBundle).map((login) => {
                target.accounts[type][login] = Database.fsAccountToMemoryAccount(loginBundle[login]);
            });
        }

        this.memoryDb = target;

        const time = process.hrtime(start);

        logger.verbose(`loadFromFile().stat: ${JSON.stringify({
            ...this.stat(),
            time: Math.round((time[0] * 1000) + (time[1] / 1000000)),
        })}`);
    }

    async saveToFile(): Promise<FsDb> {
        logger.info("saveToFile()");

        return this.saveToFileQueue.add(async () => {
            const startTime = Number(new Date());
            const store = await this.resolveStore();
            const dump = {
                ...this.dump(),
                version: DATABASE_VERSION,
            };
            const result = await store.write(dump);

            logger.verbose(`saveToFile().stat: ${JSON.stringify({...this.stat(), time: Number(new Date()) - startTime})}`);

            return result;
        });
    }

    dump(): FsDb {
        logger.info("dump()");

        const {memoryDb: source} = this;
        const target: FsDb = Database.buildEmptyDatabase();

        target.version = source.version;

        // memory => fs
        this.iterateAccounts(({account, pk}) => {
            target.accounts[pk.type][pk.login] = Database.memoryAccountToFsAccount(account);
        });

        return target;
    }

    reset() {
        this.memoryDb = Database.buildEmptyDatabase();
    }

    stat(): { records: number, conversationEntries: number, mails: number, folders: number, contacts: number } {
        logger.info("stat()");

        const stat = {records: 0, conversationEntries: 0, mails: 0, folders: 0, contacts: 0};

        this.iterateAccounts(({account}) => {
            const {conversationEntries, mails, folders, contacts} = this.accountStat(account);
            stat.records++;
            stat.conversationEntries += conversationEntries;
            stat.mails += mails;
            stat.folders += folders;
            stat.contacts += contacts;
        });

        return stat;
    }

    accountStat(
        account: MemoryDbAccount,
    ): { conversationEntries: number, mails: number, folders: number; contacts: number; unread: number } {
        const spamFolder = resolveMemoryAccountFolders(account).find(({folderType}) => folderType === MAIL_FOLDER_TYPE.SPAM);
        const spamFolderMailFolderId = spamFolder && spamFolder.mailFolderId;
        const isSpamEmail: (mail: Mail) => boolean = typeof spamFolderMailFolderId !== "undefined"
            ? ({mailFolderIds}) => mailFolderIds.includes(spamFolderMailFolderId)
            : () => false;

        return {
            conversationEntries: account.conversationEntries.size,
            mails: account.mails.size,
            folders: account.folders.size,
            contacts: account.contacts.size,
            unread: [...account.mails.values()].reduce(
                (unread, mail) => isSpamEmail(mail)
                    ? unread
                    : unread + Number(mail.unread),
                0,
            ),
        };
    }

    private async resolveStore(): Promise<FsJsonStore<FsDb>> {
        const key = Buffer.from(await this.options.encryption.keyResolver(), BASE64_ENCODING);

        if (key.length !== KEY_BYTES_32) {
            throw new Error(`Invalid encryption key length, expected: ${KEY_BYTES_32}, actual: ${key.length}`);
        }

        return new FsJsonStore<FsDb>({
            file: this.options.file,
            adapter: new EncryptionAdapter({
                key,
                preset: await this.options.encryption.presetResolver(),
            }),
            fs: this.options.fileFs,
        });
    }
}
