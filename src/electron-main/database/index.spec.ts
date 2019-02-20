import * as EncryptionAdapterBundle from "fs-json-store-encryption-adapter";
import * as msgpack from "msgpack-lite";
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
import {SerializationAdapter} from "src/electron-main/database/serialization";

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

test.serial(`save to file call should write through the "EncryptionAdapter.prototype.write" call`, async (t) => {
    class MockedEncryptionAdapter extends EncryptionAdapter {}

    const encryptionAdapterWriteSpy = sinon.spy(MockedEncryptionAdapter.prototype, "write");
    const databaseModule = await rewiremock.around(
        () => import("."),
        (mock) => {
            mock(() => import("fs-json-store-encryption-adapter"))
                .callThrough()
                .with({EncryptionAdapter: MockedEncryptionAdapter});
        },
    );
    const {options, fileFs} = buildDatabase();
    const db = new databaseModule.Database(options, fileFs);

    await db.initAccount({type: "tutanota", login: "login1"}).folders.validateAndSet(buildFolder());

    t.false(encryptionAdapterWriteSpy.called);

    await db.saveToFile();
    const dump = db.dumpToFsDb();

    t.is(1, encryptionAdapterWriteSpy.callCount);
    t.deepEqual(msgpack.encode(dump), encryptionAdapterWriteSpy.getCall(0).args[0]);
});

test.serial(`save to file call should write through the "SerializationAdapter.write" call`, async (t) => {
    let serializationAdapterWriteSpy: any;

    class MockedSerializationAdapter extends SerializationAdapter {
        constructor(input: { key: Buffer, preset: EncryptionAdapterBundle.KeyBasedPreset }) {
            super(input);
            serializationAdapterWriteSpy = sinon.spy(this, "write");
        }
    }

    const databaseModule = await rewiremock.around(
        () => import("."),
        async (rw) => {
            rw(() => import("./serialization"))
                .callThrough()
                .with({SerializationAdapter: MockedSerializationAdapter});
        },
    );
    const {options, fileFs} = buildDatabase();
    const db = new databaseModule.Database(options, fileFs);

    await db.initAccount({type: "tutanota", login: "login1"}).folders.validateAndSet(buildFolder());

    const dump = db.dumpToFsDb();

    await db.saveToFile();

    const writtenByDb = await db.fileFs.readFile(db.options.file);

    const writtenBySerializationAdapter = await serializationAdapterWriteSpy.returnValues[0];
    t.true(writtenByDb.length > 10);
    t.deepEqual(
        writtenBySerializationAdapter,
        writtenByDb,
        `written to file data must be passed through the "SerializationAdapter.write" call`,
    );

    const writtenByNewAdapterInstance = await new SerializationAdapter({
        key: Buffer.from(await db.options.encryption.keyResolver(), BASE64_ENCODING),
        preset: await db.options.encryption.presetResolver(),
    }).write(dump);
    t.notDeepEqual( // not equal, so random salt has been applied
        writtenByNewAdapterInstance,
        writtenByDb,
        `written to file data must not match the data passed through the "new SerializationAdapter.write" call`,
    );
});

test("saved/saved immutability", async (t) => {
    const db = buildDatabase();
    const type: AccountType = "tutanota";
    const login = "login";
    await db.initAccount({type, login}).folders.validateAndSet(buildFolder());
    await db.saveToFile();
    const persisted1 = db.dumpToFsDb();
    await db.saveToFile();
    const persisted2 = db.dumpToFsDb();
    t.truthy(persisted1);
    t.deepEqual(persisted1, persisted2);
});

test("save => load => save immutability", async (t) => {
    const db = buildDatabase();
    const type: AccountType = "tutanota";
    const login = "login";
    const account1 = db.initAccount({type, login});
    await account1.folders.validateAndSet(buildFolder());
    await db.saveToFile();
    const persisted1 = db.dumpToFsDb();
    const account2 = db.getAccount({type, login});
    await db.saveToFile();
    const persisted2 = db.dumpToFsDb();
    t.truthy(persisted1);
    t.deepEqual(persisted1, persisted2);
    t.truthy(account1);
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
    await db.saveToFile();
    const persisted1 = db.dumpToFsDb();
    db.initAccount({type: "tutanota", login: "login1"});
    await db.saveToFile();
    const persisted2 = db.dumpToFsDb();
    t.truthy(persisted1);
    t.truthy(persisted2);
    t.notDeepEqual(persisted1, persisted2);
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
        await new Store({file: db.options.file, fs: db.fileFs}).remove();
    }
    t.false(await db.persisted());
    await t.throwsAsync(db.loadFromFile(), `${db.options.file} does not exist`);
});

test("reset", async (t) => {
    const db = buildDatabase();
    const initial = Database.buildEmptyDatabase();

    t.deepEqual(db.dumpToFsDb(), initial);
    await db.initAccount({type: "tutanota", login: "login1"}).folders.validateAndSet(buildFolder());
    t.notDeepEqual(db.dumpToFsDb(), initial);

    const buildEmptyDatabaseSpy = sinon.spy(Database, "buildEmptyDatabase");
    const buildEmptyDatabaseCallCount = buildEmptyDatabaseSpy.callCount;
    db.reset();
    t.is(buildEmptyDatabaseCallCount + 1, buildEmptyDatabaseSpy.callCount);
    t.deepEqual(db.dumpToFsDb(), initial);
});

function buildDatabase(keyResolver?: () => Promise<string>): Database {
    if (!keyResolver) {
        const key = INITIAL_STORES.settings().databaseEncryptionKey;
        keyResolver = async () => key;
    }

    const fileFs = Fs.MemFs.volume();

    fileFs._impl.mkdirpSync(process.cwd());

    return new Database(
        {
            file: `database-${randomstring.generate()}.bin`,
            encryption: {
                keyResolver,
                presetResolver: async () => ({encryption: {type: "sodium.crypto_secretbox_easy", preset: "algorithm:default"}}),
            },
        },
        fileFs,
    );
}

// TODO use "cooky-cutter" to build complete entities factories
function buildFolder(): Folder {
    return {
        pk: randomstring.generate(),
        raw: "{}",
        id: randomstring.generate(),
        name: randomstring.generate(),
        folderType: MAIL_FOLDER_TYPE.SENT,
        mailFolderId: "123",
    };
}
