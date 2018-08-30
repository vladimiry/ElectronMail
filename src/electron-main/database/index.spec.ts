import logger from "electron-log";
import randomstring from "randomstring";
import rewiremock from "rewiremock";
import sinon from "sinon";
import test from "ava";
import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/private/constants";
import {EncryptionAdapter} from "fs-json-store-encryption-adapter";
import {Fs, Store} from "fs-json-store";

import {AccountType} from "src/shared/model/account";
import {Database} from ".";
import {Folder, MAIL_FOLDER_TYPE} from "src/shared/model/database";
import {INITIAL_STORES} from "src/electron-main/constants";

logger.transports.console.level = false;

test(`"keyResolver" should be called during save/load`, async (t) => {
    const db = buildDatabase();
    const key = await db.options.encryption.keyResolver();
    const keyResolverSpy = sinon.spy(db.options.encryption, "keyResolver");
    t.false(keyResolverSpy.called);
    await db.saveToFile();
    await db.saveToFile();
    t.is(2, keyResolverSpy.callCount);
    await db.loadFromFile();
    await db.loadFromFile();
    t.is(4, keyResolverSpy.callCount);
    t.deepEqual([key, key, key, key], await Promise.all(keyResolverSpy.returnValues));
});

test(`save to file call should write through the "EncryptionAdapter.prototype.write" call`, async (t) => {
    let writtenByAdapter: Buffer = Buffer.from([]);

    class MockedEncryptionAdapter extends EncryptionAdapter {
        async write(data: Buffer) {
            writtenByAdapter = await super.write(data);
            return writtenByAdapter;
        }
    }

    const adapterWriteSpy = sinon.spy(MockedEncryptionAdapter.prototype, "write");
    const databaseModule = await rewiremock.around(
        () => import("."),
        (mock) => {
            mock(() => import("fs-json-store-encryption-adapter"))
                .callThrough()
                .with({EncryptionAdapter: MockedEncryptionAdapter});
        },
    );
    const db = new databaseModule.Database(buildDatabaseOptions());
    // "stringify" parameters taken from the "fs-json-store/private/store.write" method
    const dump = Buffer.from(JSON.stringify(db.dumpToFsDb(), null, 4));

    t.false(adapterWriteSpy.called);

    await db.saveToFile();

    t.is(1, adapterWriteSpy.callCount);
    t.true(adapterWriteSpy.calledWithExactly(dump));

    if (!db.options.fileFs) {
        t.fail(`"options.fileFs" should be defined`);
        return;
    }

    const written = await db.options.fileFs.readFile(db.options.file);
    t.true(written.length > 10);
    t.deepEqual(writtenByAdapter, written, `written to file data must be actually encrypted by the encryption adapter's "write" call`);
});

test("saved/saved immutability", async (t) => {
    const db = buildDatabase();
    const type: AccountType = "tutanota";
    const login = "login";
    await db.getAccount({type, login}).folders.validateAndSet(buildFolder());
    const persisted1 = await db.saveToFile();
    const persisted2 = await db.saveToFile();
    t.deepEqual(persisted1, persisted2);
});

test("save => load => save immutability", async (t) => {
    const db = buildDatabase();
    const type: AccountType = "tutanota";
    const login = "login";
    const account1 = db.getAccount({type, login});
    await account1.folders.validateAndSet(buildFolder());
    const persisted1 = await db.saveToFile();
    await db.loadFromFile();
    const account2 = db.getAccount({type, login});
    const persisted2 = await db.saveToFile();
    t.deepEqual(persisted1, persisted2);
    t.deepEqual(account1, account2);
});

test("several sequence save calls should persist the same data", async (t) => {
    const db = buildDatabase();
    const persisted1 = await db.saveToFile();
    const persisted2 = await db.saveToFile();
    t.deepEqual(persisted1, persisted2);
});

test("getting nonexistent account should initialize its content", async (t) => {
    const db = buildDatabase();
    const persisted = await db.saveToFile();
    db.getAccount({type: "tutanota", login: "login1"});
    const persisted2 = await db.saveToFile();
    t.notDeepEqual(persisted, persisted2);
});

test("wrong encryption key", async (t) => {
    await t.throwsAsync(
        buildDatabase(async () => null as any).saveToFile(),
    );
    await t.throwsAsync(
        buildDatabase(async () => Buffer.alloc(30).toString(BASE64_ENCODING)).saveToFile(),
        `Invalid encryption key length, expected: ${KEY_BYTES_32}, actual: 30`,
    );
});

test("nonexistent file", async (t) => {
    const db = buildDatabase();
    if (await db.persisted()) {
        await new Store({file: db.options.file, fs: db.options.fileFs}).remove();
    }
    t.false(await db.persisted());
    await t.throwsAsync(db.loadFromFile(), `${db.options.file} does not exist`);
});

function buildDatabase(keyResolver?: () => Promise<string>) {
    return new Database(buildDatabaseOptions(keyResolver));
}

function buildDatabaseOptions(keyResolver?: () => Promise<string>) {
    if (!keyResolver) {
        const key = INITIAL_STORES.settings().databaseEncryptionKey;
        keyResolver = async () => key;
    }

    const fileFs = Fs.MemFs.volume();

    fileFs._impl.mkdirpSync(process.cwd());

    return new Database({
        file: `database-${randomstring.generate()}.bin`,
        fileFs,
        encryption: {
            keyResolver,
            presetResolver: async () => ({encryption: {type: "sodium.crypto_secretbox_easy", preset: "algorithm:default"}}),
        },
    }).options;
}

// TODO use "cooky-cutter" to build complete entities factories
function buildFolder(): Folder {
    return {
        pk: randomstring.generate(),
        raw: "{}",
        id: randomstring.generate(),
        name: randomstring.generate(),
        folderType: MAIL_FOLDER_TYPE.SENT,
    };
}
