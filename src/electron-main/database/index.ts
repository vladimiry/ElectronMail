import * as FsJsonStore from "fs-json-store";
import asap from "asap-es";
import path from "path";
import electronLog, {ElectronLog} from "electron-log";
import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/lib/private/constants";
import {KeyBasedPreset} from "fs-json-store-encryption-adapter";

import {DATABASE_VERSION, DB_INSTANCE_PROP_NAME} from "./constants";
import {DB_DATA_CONTAINER_FIELDS, DbAccountPk, FsDb, FsDbAccount} from "src/shared/model/database";
import {LogLevel} from "src/shared/model/common";
import {SerializationAdapter} from "./serialization";
import {buildAccountFoldersResolver, patchMetadata} from "src/electron-main/database/util";
import {curryFunctionMembers} from "src/shared/util";
import {hrtimeDuration} from "src/electron-main/util";

const _logger = curryFunctionMembers(electronLog, "[electron-main/database]");

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

    static mergeAccount<TL extends DbAccountPk>(
        sourceDb: DeepReadonly<Database>,
        targetDb: DeepReadonly<Database>,
        accountPk: TL,
    ): boolean {
        const logger = curryFunctionMembers(_logger, "mergeAccount()", `[${sourceDb.options.file} => ${targetDb.options.file}]`);

        logger.verbose();

        const sourceAccount = sourceDb.getAccount(accountPk);
        const targetAccount = targetDb.getMutableAccount(accountPk) || targetDb.initEmptyAccount(accountPk);
        let targetPatched = false;

        if (!sourceAccount) {
            throw new Error(`Failed to resolve the source account for merging into the target account`);
        }

        // inserting new/updated entities
        for (const entityType of DB_DATA_CONTAINER_FIELDS) {
            const patch = sourceAccount[entityType];
            const patchSize = Object.keys(patch).length;

            logger.verbose(`patch size (${entityType}):`, patchSize);

            if (!patchSize) {
                // skipping iteration as the patch is empty
                continue;
            }

            Object.assign(
                targetAccount[entityType],
                patch,
            );

            targetPatched = true;
        }

        // removing entities
        for (const entityType of DB_DATA_CONTAINER_FIELDS) {
            const deletedPks = sourceAccount.deletedPks[entityType];

            logger.verbose("removing entities count:", deletedPks.length);

            for (const pk of deletedPks) {
                delete targetAccount[entityType][pk];
                targetPatched = true;
            }
        }

        { // patching metadata
            const metadataPatched = patchMetadata(targetAccount.metadata, sourceAccount.metadata, "mergeAccount");

            logger.verbose(`metadata patched:`, metadataPatched);

            if (metadataPatched) {
                targetPatched = true;
            }
        }

        return targetPatched;
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
        this.logger = curryFunctionMembers(_logger, `[${path.basename(this.options.file)}]`);
    }

    getVersion(): string {
        return this.dbInstance.version;
    }

    getMutableAccount<TL extends DbAccountPk>({login}: TL): FsDbAccount | undefined {
        return this.getAccount({login}) as (FsDbAccount | undefined);
    }

    getAccount<TL extends DbAccountPk>({login}: TL): DeepReadonly<FsDbAccount | undefined> {
        const account = this.dbInstance.accounts[login];
        if (!account) {
            return;
        }
        return account;
    }

    initEmptyAccount<TL extends DbAccountPk>({login}: TL): FsDbAccount {
        const account: FsDbAccount = {
            conversationEntries: Object.create(null), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            mails: Object.create(null), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            folders: Object.create(null), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            contacts: Object.create(null), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
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

    * [Symbol.iterator](): Iterator<{ account: DeepReadonly<FsDbAccount>; pk: DeepReadonly<DbAccountPk> }> {
        this.logger.info("accountsIterator()");

        const {accounts} = this.dbInstance;

        for (const pk of this.getPks()) {
            const account = accounts[pk.login];
            if (!account) {
                throw new Error("Account resolving failed");
            }
            yield {pk, account};
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

    readonlyDbInstance(): DeepReadonly<FsDb> {
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
        account: DeepReadonly<FsDbAccount>,
        includingSpam: boolean,
    ): { conversationEntries: number; mails: number; folders: number; contacts: number; unread: number } {
        const {resolveFolderById} = buildAccountFoldersResolver(account, includingSpam);

        return {
            // TODO measure "Object.keys(...).length" speed and then try caching the "length" if needed
            conversationEntries: Object.keys(account.conversationEntries).length,
            mails: Object.keys(account.mails).length,
            folders: Object.keys(account.folders).length,
            contacts: Object.keys(account.contacts).length,
            unread: Object.values(account.mails).reduce(
                (accumulator, {mailFolderIds, unread}) => {
                    return mailFolderIds.some((id) => resolveFolderById({id})?.notify === 1)
                        ? accumulator + Number(unread)
                        : accumulator;
                },
                0,
            ),
        };
    }

    private logStats(
        methodName: keyof Pick<typeof Database.prototype, "loadFromFile" | "saveToFile">,
        methodDuration: ReturnType<typeof hrtimeDuration>,
        logLevel: LogLevel = "verbose",
    ): void {
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

    private getPks(): Array<DeepReadonly<DbAccountPk>> {
        return Object
            .keys(this.dbInstance.accounts)
            .map((login) => ({login}));
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
