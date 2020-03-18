import * as FsJsonStore from "fs-json-store";
import asap from "asap-es";
import path from "path";
import _logger, {ElectronLog} from "electron-log";
import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/lib/private/constants";
import {EncryptionAdapter, KeyBasedPreset} from "fs-json-store-encryption-adapter";

import {AccountConfig, AccountPersistentSession, AccountPersistentSessionBundle} from "src/shared/model/account";
import {ApiEndpointOriginFieldContainer, LoginFieldContainer} from "src/shared/model/container";
import {ReadonlyDeep} from "type-fest";
import {curryFunctionMembers} from "src/shared/util";

export class SessionStorage {
    static emptyInstance(): typeof SessionStorage.prototype.instance {
        return Object.create(null); // eslint-disable-line @typescript-eslint/no-unsafe-return
    }

    private instance: Record<string /* mapped by "login" */, AccountPersistentSessionBundle | undefined>
        = SessionStorage.emptyInstance();

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
        this.logger = curryFunctionMembers(_logger, `[electron-main/session-storage: ${path.basename(this.options.file)}]`);
    }

    reset(): void {
        this.logger.info("reset()");
        this.instance = SessionStorage.emptyInstance();
    }

    getSession(
        {login, apiEndpointOrigin}: LoginFieldContainer & ApiEndpointOriginFieldContainer,
    ): ReadonlyDeep<AccountPersistentSession> | undefined {
        this.logger.info("getSession()");
        const bundle = this.instance[login];
        return bundle && bundle[apiEndpointOrigin];
    }

    async saveSession(
        {login, apiEndpointOrigin, session}: LoginFieldContainer & ApiEndpointOriginFieldContainer & { session: AccountPersistentSession },
    ): Promise<void> {
        this.logger.info("saveSession()");
        const bundle = this.instance[login] || Object.create(null);
        bundle[apiEndpointOrigin] = session;
        this.instance[login] = bundle;
        await this.save();
    }

    async clearSession(
        {login, apiEndpointOrigin}: LoginFieldContainer & ApiEndpointOriginFieldContainer,
    ): Promise<boolean> {
        this.logger.info("clearSession()");
        const bundle = this.instance[login];
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
        this.logger.info("loadFromFile()");
        const store = await this.resolveStore();
        this.instance = await store.read() || SessionStorage.emptyInstance();
        await this.removeNonExistingLogins(actualLogins);
    }

    readonlyInstance(): ReadonlyDeep<typeof SessionStorage.prototype.instance> {
        return this.instance;
    }

    private async save(): Promise<void> {
        this.logger.info("saveToFile()");
        await this.saveToFileQueue.q(async () => {
            const store = await this.resolveStore();
            await store.write(this.instance);
        });
    }

    private async removeNonExistingLogins(
        actualLogins: ReadonlyArray<AccountConfig["login"]>,
    ): Promise<number> {
        this.logger.info("removeNonExistingLogins()");
        const loginsToRemove = Object
            .keys(this.instance)
            .filter((savedLogin) => !actualLogins.includes(savedLogin));
        for (const login of loginsToRemove) {
            delete this.instance[login];
        }
        if (loginsToRemove.length) {
            await this.save();
        }
        return loginsToRemove.length;
    }

    private async resolveStore(): Promise<FsJsonStore.Store<typeof SessionStorage.prototype.instance>> {
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
