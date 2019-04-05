import * as FsJsonStore from "fs-json-store";
import _logger from "electron-log";
import asap from "asap-es";
import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/private/constants";
import {KeyBasedPreset} from "fs-json-store-encryption-adapter";

import * as Entity from "./entity";
import {DATABASE_VERSION} from "./constants";
import {DbAccountPk, FsDb, FsDbAccount, MAIL_FOLDER_TYPE, Mail, MemoryDb, MemoryDbAccount} from "src/shared/model/database";
import {EntityMap} from "./entity-map";
import {SerializationAdapter} from "./serialization";
import {curryFunctionMembers} from "src/shared/util";
import {hrtimeDuration} from "src/electron-main/util";
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
            protonmail: {type: "protonmail", latestEventId: ""},
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

    private saveToFileQueue = new asap();

    constructor(
        public readonly options: Readonly<{
            file: string;
            encryption: Readonly<{
                keyResolver: () => Promise<string>;
                presetResolver: () => Promise<KeyBasedPreset>;
            }>
        }>,
        public readonly fileFs: FsJsonStore.Model.StoreFs = FsJsonStore.Fs.Fs.fs,
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

    accountsIterator(): {
        [Symbol.iterator]: () => Iterator<{ account: MemoryDbAccount; pk: DbAccountPk }>;
    } {
        logger.info("accountsIterator()");

        const accounts = this.memoryDb.accounts;
        const pks = this.getPks();

        let pkPointer = 0;

        return {
            [Symbol.iterator]: () => ({
                next(): IteratorResult<{ account: MemoryDbAccount; pk: DbAccountPk }> {
                    if (pkPointer >= pks.length) {
                        return {
                            done: true,
                            value: null as any,
                        };
                    }

                    const pk = pks[pkPointer++];
                    const account = accounts[pk.type][pk.login];

                    return {
                        done: false,
                        value: {pk, account},
                    };
                },
            }),
        };
    }

    deleteAccount<TL extends DbAccountPk>({type, login}: TL): void {
        delete this.memoryDb.accounts[type][login];
    }

    async persisted(): Promise<boolean> {
        // TODO get rid of "fs-json-store"
        return await new FsJsonStore.Store<FsDb>({
            file: this.options.file,
            fs: this.fileFs,
        }).readable();
    }

    async loadFromFile(): Promise<void> {
        logger.info("loadFromFile()");

        if (!(await this.persisted())) {
            throw new Error(`${this.options.file} does not exist`);
        }

        const duration = hrtimeDuration();
        const serializationAdapter = await this.buildSerializationAdapter();
        const data = await this.fileFs.readFile(this.options.file);
        const source = await serializationAdapter.read(data);
        const target: MemoryDb = Database.buildEmptyDatabase();

        target.version = source.version;

        // fs => memory
        for (const type of Object.keys(source.accounts) as Array<keyof typeof source.accounts>) {
            for (const [login, account] of Object.entries(source.accounts[type])) {
                target.accounts[type][login] = Database.fsAccountToMemoryAccount(account);
            }
        }

        this.memoryDb = target;

        logger.verbose(`loadFromFile().stat: ${JSON.stringify({
            ...this.stat(),
            time: duration.end(),
        })}`);
    }

    async saveToFile(): Promise<void> {
        logger.info("saveToFile()");

        return this.saveToFileQueue.q(async () => {
            const startTime = Number(new Date());
            const serializationAdapter = await this.buildSerializationAdapter();
            const dump = {
                ...this.dumpToFsDb(),
                version: DATABASE_VERSION,
            };

            await this.fileFs.writeFileAtomic(
                this.options.file,
                await serializationAdapter.write(dump),
            );

            logger.verbose(`saveToFile().stat: ${JSON.stringify({...this.stat(), time: Number(new Date()) - startTime})}`);
        });
    }

    dumpToFsDb(): FsDb {
        logger.info("dumpToFsDb()");

        const {memoryDb: source} = this;
        const target: FsDb = Database.buildEmptyDatabase();

        target.version = source.version;

        // memory => fs
        for (const {account, pk} of this.accountsIterator()) {
            target.accounts[pk.type][pk.login] = Database.memoryAccountToFsAccount(account);
        }

        return target;
    }

    reset() {
        this.memoryDb = Database.buildEmptyDatabase();
    }

    stat(): { records: number, conversationEntries: number, mails: number, folders: number, contacts: number } {
        logger.info("stat()");

        const stat = {records: 0, conversationEntries: 0, mails: 0, folders: 0, contacts: 0};

        for (const {account} of this.accountsIterator()) {
            const {conversationEntries, mails, folders, contacts} = this.accountStat(account, true);
            stat.records++;
            stat.conversationEntries += conversationEntries;
            stat.mails += mails;
            stat.folders += folders;
            stat.contacts += contacts;
        }

        return stat;
    }

    accountStat(
        account: MemoryDbAccount,
        includingSpam: boolean = false,
    ): { conversationEntries: number, mails: number, folders: number; contacts: number; unread: number } {
        const hasSpamEmail: (mail: Mail) => boolean = includingSpam
            ? () => false
            : this.spamFolderTester(account);

        return {
            conversationEntries: account.conversationEntries.size,
            mails: account.mails.size,
            folders: account.folders.size,
            contacts: account.contacts.size,
            unread: [...account.mails.values()].reduce(
                (unread, mail) => hasSpamEmail(mail)
                    ? unread
                    : unread + Number(mail.unread),
                0,
            ),
        };
    }

    private getPks(): DbAccountPk[] {
        const accounts = this.memoryDb.accounts;

        return (Object.keys(accounts) as Array<keyof typeof accounts>).reduce(
            (keys: DbAccountPk[], type) => {
                for (const login of Object.keys(accounts[type])) {
                    keys.push({type, login});
                }
                return keys;
            },
            [],
        );
    }

    private spamFolderTester(account: MemoryDbAccount): (mail: Mail) => boolean {
        const folder = resolveMemoryAccountFolders(account).find(({folderType}) => folderType === MAIL_FOLDER_TYPE.SPAM);
        const mailFolderId = folder && folder.mailFolderId;
        const result: ReturnType<typeof Database.prototype.spamFolderTester> = typeof mailFolderId !== "undefined"
            ? ({mailFolderIds}) => mailFolderIds.includes(mailFolderId)
            : () => false;

        return result;
    }

    private async buildSerializationAdapter(): Promise<SerializationAdapter> {
        const key = Buffer.from(await this.options.encryption.keyResolver(), BASE64_ENCODING);

        if (key.length !== KEY_BYTES_32) {
            throw new Error(`Invalid encryption key length, expected: ${KEY_BYTES_32}, actual: ${key.length}`);
        }

        return new SerializationAdapter({
            key,
            preset: await this.options.encryption.presetResolver(),
        });
    }
}
