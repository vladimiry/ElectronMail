import * as EncryptionAdapterBundle from "fs-json-store-encryption-adapter";
import * as msgpack from "msgpack-lite";
import oboe from "oboe";
import {Readable} from "stream";

import {FsDb} from "src/shared/model/database";

interface Header extends EncryptionAdapterBundle.KeyBasedFileHeader {
    serialization?: {
        type: "msgpack";
    };
}

const util: {
    split: (data: Buffer) => { header: Header; cipher: Buffer; };
    merge: (header: Header, cipher: Buffer) => Buffer;
} = (() => {
    const separator = Buffer.from([0o0]);
    const result: typeof util = {
        split(data) {
            const headerBytesSize = data.indexOf(separator);
            const headerBuffer = data.slice(0, headerBytesSize);
            const header: Header = JSON.parse(headerBuffer.toString());
            const cipher = data.slice(headerBytesSize + 1);

            return {header, cipher};
        },

        merge(header, cipher) {
            return Buffer.concat([
                Buffer.from(JSON.stringify(header)),
                separator,
                cipher,
            ]);
        },
    };

    return result;
})();

const bufferToStream = (buffer: Buffer): Readable => {
    const stream = new Readable();

    stream.push(buffer);
    stream.push(null);

    return stream;
};

export class SerializationAdapter {
    public readonly read: (data: Buffer) => Promise<FsDb>;

    public readonly write: (data: FsDb) => Promise<Buffer>;

    constructor(input: { key: Buffer, preset: EncryptionAdapterBundle.KeyBasedPreset }) {
        const encryptionAdapter = new EncryptionAdapterBundle.EncryptionAdapter(input);

        this.read = async (data) => {
            const {header: {serialization}} = util.split(data);
            const decryptedData = await encryptionAdapter.read(data);

            if (serialization && serialization.type === "msgpack") {
                return msgpack.decode(decryptedData);
            }

            const readableStream = bufferToStream(decryptedData);

            return new Promise((resolve, reject) => {
                oboe(readableStream)
                    .done(resolve)
                    .fail(reject);
            });
        };

        this.write = async (data) => {
            const serializedData = msgpack.encode(data);
            const encryptedData = await encryptionAdapter.write(serializedData);
            const {header, cipher} = util.split(encryptedData);

            header.serialization = {type: "msgpack"};

            return util.merge(header, cipher);
        };
    }
}
