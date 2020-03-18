import * as FsJsonStore from "fs-json-store";
import asap from "asap-es";
import path from "path";
import _logger, {ElectronLog} from "electron-log";
import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/lib/private/constants";
import {KeyBasedPreset} from "fs-json-store-encryption-adapter";

import {DATABASE_VERSION, DB_INSTANCE_PROP_NAME} from "./constants";
import {DbAccountPk, FsDb, FsDbAccount, MAIL_FOLDER_TYPE, Mail} from "src/shared/model/database";
import {LogLevel} from "src/shared/model/common";
import {ReadonlyDeep} from "type-fest";
import {SerializationAdapter} from "./serialization";
import {curryFunctionMembers, logLevelEnabled} from "src/shared/util";
import {hrtimeDuration} from "src/electron-main/util";
import {resolveAccountFolders} from "./util";

export class Database {
    static buildEmptyDb(): FsDb {
        return {
            version: DATABASE_VERSION,
            accounts: {},
        };
    }

    static buildEmptyAccountMetadata(): FsDbAccount["metadata"] {
        return {
            latestEventId: "",
        };
    }

    private readonly logger: ElectronLog;

    private readonly saveToFileQueue = new asap();

    private [DB_INSTANCE_PROP_NAME]: FsDb = Database.buildEmptyDb();

    constructor(
        public readonly options: Readonly<{
            file: string;
            encryption: Readonly<{
                keyResolver: () => Promise<string>;
                presetResolver: () => Promise<KeyBasedPreset>;
            }>;
        }>,
        public readonly fileFs: FsJsonStore.Model.StoreFs = FsJsonStore.Fs.Fs.fs,
    ) {
        this.logger = curryFunctionMembers(_logger, `[electron-main/database: ${path.basename(this.options.file)}]`);
    }

    getVersion(): string {
        return this.dbInstance.version;
    }

    getMutableAccount<TL extends DbAccountPk>({login}: TL): FsDbAccount | undefined {
        return this.getAccount({login}) as (FsDbAccount | undefined);
    }

    getAccount<TL extends DbAccountPk>({login}: TL): ReadonlyDeep<FsDbAccount | undefined> {
        const account = this.dbInstance.accounts[login];
        if (!account) {
            return;
        }
        return account;
    }

    initAccount<TL extends DbAccountPk>({login}: TL): FsDbAccount {
        const account: FsDbAccount = {
            conversationEntries: Object.create(null),
            mails: Object.create(null),
            folders: Object.create(null),
            contacts: Object.create(null),
            metadata: Database.buildEmptyAccountMetadata(),
            deletedPks: {
                conversationEntries: [],
                mails: [],
                folders: [],
                contacts: [],
            },
        };

        this.dbInstance.accounts[login] = account;

        return account;
    }

    * [Symbol.iterator](): Iterator<{ account: ReadonlyDeep<FsDbAccount>; pk: ReadonlyDeep<DbAccountPk> }> {
        this.logger.info("accountsIterator()");

        const {accounts} = this.dbInstance;

        for (const pk of this.getPks()) {
            yield {
                pk,
                account: accounts[pk.login],
            };
        }
    }

    deleteAccount<TL extends DbAccountPk>({login}: TL): void {
        delete this.dbInstance.accounts[login];
    }

    async persisted(): Promise<boolean> {
        // TODO get rid of "fs-json-store" use
        return new FsJsonStore.Store<FsDb>({
            file: this.options.file,
            fs: this.fileFs,
        }).readable();
    }

    async loadFromFile(): Promise<void> {
        this.logger.info("loadFromFile()");

        if (!(await this.persisted())) {
            throw new Error(`${this.options.file} does not exist`);
        }

        const duration = hrtimeDuration();
        const serializationAdapter = await this.buildSerializationAdapter();

        this.dbInstance = await serializationAdapter.read(
            await this.fileFs.readFile(
                this.options.file,
            ),
        );

        this.logStats("loadFromFile", duration);
    }

    async saveToFile(): Promise<void> {
        this.logger.info("saveToFile()");

        return this.saveToFileQueue.q(async () => {
            const duration = hrtimeDuration();
            const serializationAdapter = await this.buildSerializationAdapter();

            await this.fileFs.writeFileAtomic(
                this.options.file,
                await serializationAdapter.write({
                    ...this.readonlyDbInstance(),
                    version: DATABASE_VERSION,
                }),
            );

            this.logStats("saveToFile", duration);
        });
    }

    readonlyDbInstance(): ReadonlyDeep<FsDb> {
        return this.dbInstance;
    }

    reset(): void {
        this.dbInstance = Database.buildEmptyDb();
    }

    stat(): { records: number; conversationEntries: number; mails: number; folders: number; contacts: number } {
        this.logger.info("stat()");

        const stat = {records: 0, conversationEntries: 0, mails: 0, folders: 0, contacts: 0};

        for (const {account} of this) {
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
        account: ReadonlyDeep<FsDbAccount>,
        includingSpam = false,
    ): { conversationEntries: number; mails: number; folders: number; contacts: number; unread: number } {
        const hasSpamEmail: (mail: Mail) => boolean = includingSpam
            ? (): false => false
            : this.spamFolderTester(account);

        return {
            // TODO measure "Object.keys(...).length" speed and then try caching the "length" if needed
            conversationEntries: Object.keys(account.conversationEntries).length,
            mails: Object.keys(account.mails).length,
            folders: Object.keys(account.folders).length,
            contacts: Object.keys(account.contacts).length,
            unread: Object.values(account.mails).reduce(
                (unread, mail) => hasSpamEmail(mail)
                    ? unread
                    : unread + Number(mail.unread),
                0,
            ),
        };
    }

    private logStats(
        methodName: keyof Pick<typeof Database.prototype, "loadFromFile" | "saveToFile">,
        methodDuration: ReturnType<typeof hrtimeDuration>,
        logLevel: LogLevel = "verbose",
    ): void {
        if (!logLevelEnabled(logLevel, this.logger)) {
            return;
        }

        const dataToLog: ReturnType<typeof Database.prototype.stat> & { methodTime: number; statTime: number } = (
            (): typeof dataToLog => {
                const methodTime = methodDuration.end(); // first of all
                const statsDuration = hrtimeDuration(); // before the "stat()" called
                const stat = this.stat();
                const statTime = statsDuration.end(); // after the "stat()" called
                return {methodTime, statTime, ...stat};
            }
        )();

        this.logger[logLevel](`${methodName}().stat: ${JSON.stringify(dataToLog, null, 2)}`);
    }

    private getPks(): Array<ReadonlyDeep<DbAccountPk>> {
        return Object
            .keys(this.dbInstance.accounts)
            .map((login) => ({login}));
    }

    private spamFolderTester(account: ReadonlyDeep<FsDbAccount>): (mail: Mail) => boolean {
        const folder = resolveAccountFolders(account).find(({folderType}) => folderType === MAIL_FOLDER_TYPE.SPAM);
        const mailFolderId = folder && folder.mailFolderId;
        const result: ReturnType<typeof Database.prototype.spamFolderTester> = typeof mailFolderId !== "undefined"
            ? ({mailFolderIds}): boolean => mailFolderIds.includes(mailFolderId)
            : (): false => false;

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
