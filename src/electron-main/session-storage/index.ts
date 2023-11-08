import _logger, {LogFunctions} from "electron-log";
import asap from "asap-es";
import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/lib/private/constants";
import {EncryptionAdapter, KeyBasedPreset} from "fs-json-store-encryption-adapter";
import * as FsJsonStore from "fs-json-store";
import path from "path";

import {AccountConfig, AccountPersistentSession} from "src/shared/model/account";
import type {AccountSessionStoragePatchBundle} from "src/shared/model/account";
import {ApiEndpointOriginFieldContainer, LoginFieldContainer} from "src/shared/model/container";
import {curryFunctionMembers} from "src/shared/util";
import {emptySessionStorageEntity} from "./util";
import {FsDb} from "src/shared/model/database";
import {generateDataSaltBase64} from "src/electron-main/util";
import {ONE_KB_BYTES} from "src/shared/const";
import {SESSION_STORAGE_VERSION} from "src/electron-main/session-storage/const";
import {SessionStorageModel} from "src/electron-main/session-storage/model";
import {upgradeSessionStorage} from "src/electron-main/session-storage/upgrade";
import {verifyUrlOriginValue} from "src/shared/util/url";

export class SessionStorage {
    private entity: SessionStorageModel = emptySessionStorageEntity();

    private readonly logger: LogFunctions;

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
        this.entity = emptySessionStorageEntity();
    }

    getSession(
        {login, apiEndpointOrigin}: LoginFieldContainer & ApiEndpointOriginFieldContainer,
    ): DeepReadonly<AccountPersistentSession> | undefined {
        this.logger.info(nameof(SessionStorage.prototype.getSession)); // eslint-disable-line @typescript-eslint/unbound-method
        return this.entity.instance[login]?.[apiEndpointOrigin];
    }

    getSessionStoragePatch(
        {login, apiEndpointOrigin}: LoginFieldContainer & ApiEndpointOriginFieldContainer,
    ): DeepReadonly<import("ts-essentials").ValueOf<AccountSessionStoragePatchBundle>> | undefined {
        this.logger.info(nameof(SessionStorage.prototype.getSessionStoragePatch)); // eslint-disable-line @typescript-eslint/unbound-method
        return this.entity.sessionStoragePatchInstance[login]?.[apiEndpointOrigin];
    }

    async saveSession(
        {login, apiEndpointOrigin, session}: LoginFieldContainer & ApiEndpointOriginFieldContainer & { session: AccountPersistentSession },
    ): Promise<void> {
        this.logger.info(nameof(SessionStorage.prototype.saveSession)); // eslint-disable-line @typescript-eslint/unbound-method
        (this.entity.instance[login] ??= {})[verifyUrlOriginValue(apiEndpointOrigin)] = session;
        await this.saveToFile();
    }

    async saveSessionStoragePatch(
        {login, apiEndpointOrigin, __cookieStore__}: LoginFieldContainer & ApiEndpointOriginFieldContainer & { __cookieStore__: string },
    ): Promise<void> {
        this.logger.info(nameof(SessionStorage.prototype.saveSessionStoragePatch)); // eslint-disable-line @typescript-eslint/unbound-method
        (this.entity.sessionStoragePatchInstance[login] ??= {})[verifyUrlOriginValue(apiEndpointOrigin)] = {__cookieStore__};
        await this.saveToFile();
    }

    async clearSession(
        {login, apiEndpointOrigin}: LoginFieldContainer & ApiEndpointOriginFieldContainer,
    ): Promise<boolean> {
        this.logger.info(nameof(SessionStorage.prototype.clearSession)); // eslint-disable-line @typescript-eslint/unbound-method
        const bundle = this.entity.instance[login];
        if (bundle && (apiEndpointOrigin in bundle)) {
            delete bundle[apiEndpointOrigin];
            await this.saveToFile();
            return true;
        }
        return false;
    }

    async load(
        actualLogins: ReadonlyArray<AccountConfig["login"]>,
    ): Promise<void> {
        this.logger.info(nameof(SessionStorage.prototype.load)); // eslint-disable-line @typescript-eslint/unbound-method
        const store = await this.resolveStore();
        this.entity = await store.read() ?? emptySessionStorageEntity();
        {
            const check1 = upgradeSessionStorage(this.entity); // TODO upgrade the structure once on app start
            const check2 = this.removeNonExistingLogins(actualLogins);
            if (check1 || check2) {
                await this.saveToFile();
            }
        }
    }

    async persisted(): Promise<boolean> {
        // TODO get rid of "fs-json-store" use
        return new FsJsonStore.Store<FsDb>({file: this.options.file}).readable();
    }

    private removeNonExistingLogins(
        actualLogins: ReadonlyArray<AccountConfig["login"]>,
    ): boolean {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        this.logger.info(nameof(SessionStorage.prototype.removeNonExistingLogins));
        const loginsToRemove = Object.keys(this.entity.instance).filter((savedLogin) => !actualLogins.includes(savedLogin));
        for (const login of loginsToRemove) {
            delete this.entity.instance[login];
        }
        return Boolean(loginsToRemove.length);
    }

    async saveToFile(): Promise<void> {
        this.logger.info(nameof(SessionStorage.prototype.saveToFile)); // eslint-disable-line @typescript-eslint/unbound-method
        await this.saveToFileQueue.q(async () => {
            const store = await this.resolveStore();
            const {entity} = this;
            const dataToSave: Omit<typeof entity, "dataSaltBase64"> & Required<Pick<typeof entity, "dataSaltBase64">> = {
                ...entity,
                version: SESSION_STORAGE_VERSION,
                dataSaltBase64: generateDataSaltBase64(ONE_KB_BYTES * 5, ONE_KB_BYTES * 10),
            };
            await store.write(dataToSave);
        });
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
