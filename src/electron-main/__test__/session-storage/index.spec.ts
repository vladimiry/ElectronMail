import logger from "electron-log";
import randomstring from "randomstring";
import rewiremock from "rewiremock";
import sinon from "sinon";
import test from "ava";
import {EncryptionAdapter, KeyBasedPreset} from "fs-json-store-encryption-adapter";
import {Fs} from "fs-json-store";

import {INITIAL_STORES} from "src/electron-main/constants";

logger.transports.console.level = false;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function buildSessionStorage(keyResolver?: () => Promise<string>) {
    if (!keyResolver) {
        const key = INITIAL_STORES.settings().sessionStorageEncryptionKey;
        keyResolver = async (): Promise<typeof key> => key;
    }

    const fileFs = Fs.MemFs.volume();

    fileFs._impl.mkdirpSync(process.cwd());

    class MockedEncryptionAdapter extends EncryptionAdapter {}

    const encryptionAdapterWriteSpy = sinon.spy(MockedEncryptionAdapter.prototype, "write");

    const sessionStorageModule = await rewiremock.around(
        async () => import("src/electron-main/session-storage"),
        (mock) => {
            mock(async () => import("fs-json-store-encryption-adapter"))
                .callThrough()
                .with({EncryptionAdapter: MockedEncryptionAdapter});
        },
    );

    return {
        sessionStorage: new sessionStorageModule.SessionStorage(
            {
                file: `database-${randomstring.generate()}.bin`,
                encryption: {
                    keyResolver,
                    presetResolver: async (): Promise<KeyBasedPreset> => {
                        return {encryption: {type: "sodium.crypto_secretbox_easy", preset: "algorithm:default"}};
                    },
                },
            },
            fileFs,
        ),
        encryptionAdapterWriteSpy,
    } as const;
}

test(`save to file call should write through the "EncryptionAdapter.prototype.write" call`, async (t) => {
    const {sessionStorage, encryptionAdapterWriteSpy} = await buildSessionStorage();

    t.false(encryptionAdapterWriteSpy.called);

    await sessionStorage.saveSession({
        login: randomstring.generate(),
        apiEndpointOrigin: randomstring.generate(),
        session: {
            cookies: [],
            sessionStorage: {[randomstring.generate()]: randomstring.generate()},
            window: {
                name: {[randomstring.generate()]: randomstring.generate()},
            },
        },
    });
    const sessionStorageInstanceDump = JSON.parse(JSON.stringify(sessionStorage.readonlyInstance()));
    const expectedEncryptionAdapterWriteSpyArg1 = Buffer.from(JSON.stringify(sessionStorageInstanceDump));

    t.is(1, encryptionAdapterWriteSpy.callCount);
    t.true(encryptionAdapterWriteSpy.calledWithExactly(expectedEncryptionAdapterWriteSpyArg1));

    t.deepEqual(
        expectedEncryptionAdapterWriteSpyArg1,
        encryptionAdapterWriteSpy.getCall(0).args[0],
    );
});
