import asap from "asap-es";
import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/lib/private/constants";
import electronLog, {ElectronLog} from "electron-log";
import {EncryptionAdapter, KeyBasedPreset} from "fs-json-store-encryption-adapter";
import * as FsJsonStore from "fs-json-store";
import path from "path";

import {buildAccountFoldersResolver, patchMetadata} from "src/electron-main/database/util";
import {buildSerializer} from "src/electron-main/database/serialization";
import {curryFunctionMembers} from "src/shared/util";
import {DATABASE_VERSION, DB_INSTANCE_PROP_NAME} from "./constants";
import {DB_DATA_CONTAINER_FIELDS, DbAccountPk, FsDb, FsDbAccount} from "src/shared/model/database";
import {generateDataSaltBase64, hrtimeDuration} from "src/electron-main/util";
import {LogLevel} from "src/shared/model/common";
import {ONE_KB_BYTES} from "src/shared/constants";

const _logger = curryFunctionMembers(electronLog, __filename);

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

    static buildEmptyAccount(): FsDbAccount {
        return {
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
    }

    static mergeAccount<TL extends DbAccountPk>(
        sourceDb: DeepReadonly<Database>,
        targetDb: DeepReadonly<Database>,
        accountPk: TL,
    ): boolean {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const logger = curryFunctionMembers(_logger, nameof(Database.mergeAccount), `${sourceDb.options.file} => ${targetDb.options.file}`);

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

    private readonly serializer: ReturnType<typeof buildSerializer>;

    private [DB_INSTANCE_PROP_NAME]: FsDb = Database.buildEmptyDb();

    constructor(
        public readonly options: Readonly<{
            file: string;
            encryption: Readonly<{
                keyResolver: () => Promise<string>;
                presetResolver: () => Promise<KeyBasedPreset>;
            }>;
        }>
    ) {
        this.serializer = buildSerializer(this.options.file);
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
        const account = Database.buildEmptyAccount();
        this.dbInstance.accounts[login] = account;
        return account;
    }

    * [Symbol.iterator](): Iterator<{ account: DeepReadonly<FsDbAccount>; pk: DeepReadonly<DbAccountPk> }> {
        this.logger.info("iterator()");

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
        return new FsJsonStore.Store<FsDb>({file: this.options.file}).readable();
    }

    async loadFromFile(): Promise<void> {
        this.logger.info(nameof(Database.prototype.loadFromFile)); // eslint-disable-line @typescript-eslint/unbound-method

        if (!(await this.persisted())) {
            throw new Error(`${this.options.file} does not exist`);
        }

        const duration = hrtimeDuration();

        this.dbInstance = await this.serializer.read(
            await this.buildEncryptionAdapter(),
        );

        this.logStats("loadFromFile", duration);
    }

    async saveToFile(): Promise<void> {
        this.logger.info(nameof(Database.prototype.saveToFile)); // eslint-disable-line @typescript-eslint/unbound-method

        return this.saveToFileQueue.q(async () => {
            const duration = hrtimeDuration();
            const dataToStore: DeepReadonly<FsDb> = {
                ...this.dbInstance,
                version: DATABASE_VERSION,
                dataSaltBase64: generateDataSaltBase64(ONE_KB_BYTES * 100, ONE_KB_BYTES * 200),
            };

            await this.serializer.write(
                await this.buildEncryptionAdapter(),
                dataToStore,
            );

            this.logStats("saveToFile", duration);
        });
    }

    reset(): void {
        this.dbInstance = Database.buildEmptyDb();
    }

    stat(): { records: number; conversationEntries: number; mails: number; folders: number; contacts: number } {
        this.logger.info(nameof(Database.prototype.stat)); // eslint-disable-line @typescript-eslint/unbound-method

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

    private async buildEncryptionAdapter(): Promise<EncryptionAdapter> {
        const key = Buffer.from(await this.options.encryption.keyResolver(), BASE64_ENCODING);
        if (key.length !== KEY_BYTES_32) {
            throw new Error(`Invalid encryption key length, expected: ${KEY_BYTES_32}, actual: ${key.length}`);
        }
        return new EncryptionAdapter({key, preset: await this.options.encryption.presetResolver()});
    }
}
