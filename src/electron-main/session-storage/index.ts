import * as FsJsonStore from "fs-json-store";
import asap from "asap-es";
import path from "path";
import _logger, {ElectronLog} from "electron-log";
import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/lib/private/constants";
import {EncryptionAdapter, KeyBasedPreset} from "fs-json-store-encryption-adapter";

import {AccountConfig, AccountPersistentSession} from "src/shared/model/account";
import {ApiEndpointOriginFieldContainer, LoginFieldContainer} from "src/shared/model/container";
import {ONE_KB_BYTES} from "src/shared/constants";
import {SESSION_STORAGE_VERSION} from "src/electron-main/session-storage/const";
import {SessionStorageModel} from "src/electron-main/session-storage/model";
import {curryFunctionMembers, verifyUrlOriginValue} from "src/shared/util";
import {generateDataSaltBase64} from "src/electron-main/util";

export class SessionStorage {
    static emptyEntity(): typeof SessionStorage.prototype.entity {
        return {version: SESSION_STORAGE_VERSION, instance: {}};
    }

    private entity: SessionStorageModel = SessionStorage.emptyEntity();

    private readonly logger: ElectronLog;

    private readonly saveToFileQueue = new asap();

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
        this.logger = curryFunctionMembers(_logger, `${__filename}: ${path.basename(this.options.file)}`);
    }

    reset(): void {
        this.logger.info(nameof(SessionStorage.prototype.reset)); // eslint-disable-line @typescript-eslint/unbound-method
        this.entity = SessionStorage.emptyEntity();
    }

    getSession(
        {login, apiEndpointOrigin}: LoginFieldContainer & ApiEndpointOriginFieldContainer,
    ): DeepReadonly<AccountPersistentSession> | undefined {
        this.logger.info(nameof(SessionStorage.prototype.getSession)); // eslint-disable-line @typescript-eslint/unbound-method
        const bundle = this.entity.instance[login];
        return bundle && bundle[apiEndpointOrigin];
    }

    async saveSession(
        {login, apiEndpointOrigin, session}: LoginFieldContainer & ApiEndpointOriginFieldContainer & { session: AccountPersistentSession },
    ): Promise<void> {
        this.logger.info(nameof(SessionStorage.prototype.saveSession)); // eslint-disable-line @typescript-eslint/unbound-method
        const bundle = this.entity.instance[login] ?? {};
        bundle[verifyUrlOriginValue(apiEndpointOrigin)] = session; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
        this.entity.instance[login] = bundle; // eslint-disable-line @typescript-eslint/no-unsafe-assignment
        await this.save();
    }

    async clearSession(
        {login, apiEndpointOrigin}: LoginFieldContainer & ApiEndpointOriginFieldContainer,
    ): Promise<boolean> {
        this.logger.info(nameof(SessionStorage.prototype.clearSession)); // eslint-disable-line @typescript-eslint/unbound-method
        // no need to "verify url origin value" during removing the record ("verifyUrlOriginValue()" calling)
        const bundle = this.entity.instance[login];
        if (bundle && (apiEndpointOrigin in bundle)) {
            delete bundle[apiEndpointOrigin];
            await this.save();
            return true;
        }
        return false;
    }

    async load(
        actualLogins: ReadonlyArray<AccountConfig["login"]>,
    ): Promise<void> {
        this.logger.info(nameof(SessionStorage.prototype.load)); // eslint-disable-line @typescript-eslint/unbound-method
        const store = await this.resolveStore();
        this.entity = await store.read() ?? SessionStorage.emptyEntity();
        // TODO upgrade the structure once on app start
        if (this.entity.version !== 1) {
            this.logger.verbose(
                // eslint-disable-next-line @typescript-eslint/unbound-method
                `${nameof(SessionStorage.prototype.load)} upgrading session storage structure (version: ${String(this.entity.version)})`,
            );
            this.entity = {
                ...SessionStorage.emptyEntity(),
                instance: this.entity as unknown as SessionStorageModel["instance"],
            };
            await this.save();
        }
        await this.removeNonExistingLogins(actualLogins);
    }

    private async save(): Promise<void> {
        this.logger.info(nameof(SessionStorage.prototype.save)); // eslint-disable-line @typescript-eslint/unbound-method
        await this.saveToFileQueue.q(async () => {
            const store = await this.resolveStore();
            const {entity} = this;
            const dataToSave: StrictOmit<typeof entity, "dataSaltBase64"> & Required<Pick<typeof entity, "dataSaltBase64">> = {
                ...entity,
                version: SESSION_STORAGE_VERSION,
                dataSaltBase64: generateDataSaltBase64(ONE_KB_BYTES * 5, ONE_KB_BYTES * 10),
            };
            await store.write(dataToSave);
        });
    }

    private async removeNonExistingLogins(
        actualLogins: ReadonlyArray<AccountConfig["login"]>,
    ): Promise<number> {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        this.logger.info(nameof(SessionStorage.prototype.removeNonExistingLogins));
        const loginsToRemove = Object.keys(this.entity.instance).filter((savedLogin) => !actualLogins.includes(savedLogin));
        for (const login of loginsToRemove) {
            delete this.entity.instance[login];
        }
        if (loginsToRemove.length) {
            await this.save();
        }
        return loginsToRemove.length;
    }

    private async resolveStore(): Promise<FsJsonStore.Store<typeof SessionStorage.prototype.entity>> {
        const key = Buffer.from(await this.options.encryption.keyResolver(), BASE64_ENCODING);
        const preset = await this.options.encryption.presetResolver();

        if (key.length !== KEY_BYTES_32) {
            throw new Error(`Invalid encryption key length, expected: ${KEY_BYTES_32}, actual: ${key.length}`);
        }

        return new FsJsonStore.Store({
            file: this.options.file,
            fs: this.fileFs,
            adapter: new EncryptionAdapter({key, preset}),
        });
    }
}
