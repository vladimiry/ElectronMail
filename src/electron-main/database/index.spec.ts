import * as EncryptionAdapterBundle from "fs-json-store-encryption-adapter";
import * as msgpack from "@msgpack/msgpack";
import logger from "electron-log";
import randomstring from "randomstring";
import rewiremock from "rewiremock";
import sinon from "sinon";
import test from "ava";
import {BASE64_ENCODING, KEY_BYTES_32} from "fs-json-store-encryption-adapter/lib/private/constants";
import {EncryptionAdapter} from "fs-json-store-encryption-adapter";
import {Fs, Store} from "fs-json-store";

import {Database} from ".";
import {Folder, MAIL_FOLDER_TYPE} from "src/shared/model/database";
import {INITIAL_STORES} from "src/electron-main/constants";
import {SerializationAdapter} from "src/electron-main/database/serialization";
import {validateEntity} from "src/electron-main/database/validation";

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

    const folderStub = buildFolder();
    db.initAccount({login: "login1"})
        .folders[folderStub.pk] = await validateEntity("folders", folderStub);

    t.false(encryptionAdapterWriteSpy.called);

    await db.saveToFile();
    const dump = JSON.parse(JSON.stringify(db.readonlyDbInstance()));

    t.is(1, encryptionAdapterWriteSpy.callCount);
    t.deepEqual(
        Buffer.from(
            msgpack.encode(dump),
        ),
        encryptionAdapterWriteSpy.getCall(0).args[0],
    );
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

    const folderStub = buildFolder();
    db.initAccount({login: "login1"})
        .folders[folderStub.pk] = await validateEntity("folders", folderStub);

    const dump = JSON.parse(JSON.stringify(db.readonlyDbInstance()));

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

test("several sequence save calls should persist the same data", async (t) => {
    const db = buildDatabase();
    const folderStub = buildFolder();
    db.initAccount({login: "login1"})
        .folders[folderStub.pk] = await validateEntity("folders", folderStub);

    await db.saveToFile();
    await db.loadFromFile();
    const readonlyDbInstanceInstance1 = db.readonlyDbInstance();
    const readonlyDbInstanceDump1 = JSON.parse(JSON.stringify(readonlyDbInstanceInstance1));

    await db.saveToFile();
    await db.loadFromFile();
    const readonlyDbInstanceInstance2 = db.readonlyDbInstance();
    const readonlyDbInstanceDump2 = JSON.parse(JSON.stringify(readonlyDbInstanceInstance2));

    t.false(readonlyDbInstanceInstance1 === readonlyDbInstanceInstance2);
    t.deepEqual(readonlyDbInstanceDump1, readonlyDbInstanceDump2);
});

test("getting nonexistent account should initialize its content", async (t) => {
    const db = buildDatabase();
    await db.saveToFile();
    const readonlyDbInstanceDump1 = JSON.parse(JSON.stringify(db.readonlyDbInstance()));
    db.initAccount({login: "login1"});
    await db.saveToFile();
    const readonlyDbInstanceDump12 = JSON.parse(JSON.stringify(db.readonlyDbInstance()));
    t.truthy(readonlyDbInstanceDump1);
    t.truthy(readonlyDbInstanceDump12);
    t.notDeepEqual(readonlyDbInstanceDump1, readonlyDbInstanceDump12);
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
    const initial = Database.buildEmptyDb();

    t.deepEqual(JSON.parse(JSON.stringify(db.readonlyDbInstance())), initial);
    const folderStub = buildFolder();
    db.initAccount({login: "login1"})
        .folders[folderStub.pk] = await validateEntity("folders", folderStub);

    t.notDeepEqual(JSON.parse(JSON.stringify(db.readonlyDbInstance())), initial);

    const buildEmptyDbSpy = sinon.spy(Database, "buildEmptyDb");
    const buildEmptyDbCallCount = buildEmptyDbSpy.callCount;
    db.reset();
    t.is(buildEmptyDbCallCount + 1, buildEmptyDbSpy.callCount);
    t.deepEqual(JSON.parse(JSON.stringify(db.readonlyDbInstance())), initial);
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
