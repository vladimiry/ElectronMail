import * as EncryptionAdapterBundle from "fs-json-store-encryption-adapter";
import * as msgpack from "@msgpack/msgpack";
import _logger from "electron-log";
import oboe from "oboe";
import {Readable} from "stream";

import {FsDb} from "src/shared/model/database";
import {curryFunctionMembers} from "src/shared/util";

interface Header extends EncryptionAdapterBundle.KeyBasedFileHeader {
    serialization?: {
        type: "msgpack";
    };
}

const persistencePartsUtil: Readonly<{
    split: (data: Buffer) => { header: Header; cipher: Buffer; };
    concat: (header: Header, cipher: Buffer) => Buffer;
}> = (() => {
    const separator = Buffer.from([0o0]);
    const result: typeof persistencePartsUtil = {
        split(data) {
            const headerBytesSize = data.indexOf(separator);
            const headerBuffer = data.slice(0, headerBytesSize);
            const header: Header = JSON.parse(headerBuffer.toString());
            const cipher = data.slice(headerBytesSize + 1);

            return {header, cipher};
        },

        concat(header, cipher) {
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

    public readonly write: (data: DeepReadonly<FsDb>) => Promise<Buffer>;

    private logger = curryFunctionMembers(_logger, "[src/electron-main/database/serialization]", "[SerializationAdapter]");

    constructor(input: { key: Buffer, preset: EncryptionAdapterBundle.KeyBasedPreset }) {
        this.logger.info("constructor()");

        const encryptionAdapter = new EncryptionAdapterBundle.EncryptionAdapter(input);

        this.read = async (data: Buffer) => {
            this.logger.info(`read() buffer.length: ${data.length}`);

            const {header: {serialization}} = persistencePartsUtil.split(data);
            const decryptedData = await encryptionAdapter.read(data);

            if (serialization && serialization.type === "msgpack") {
                this.logger.verbose(`"msgpack.decode" start`);
                const decoded = msgpack.decode(decryptedData) as FsDb;
                this.logger.verbose(`"msgpack.decode" end`);
                return decoded;
            }

            const readableStream = bufferToStream(decryptedData);

            return new Promise((resolve, reject) => {
                this.logger.verbose(`"oboe" start`);

                // TODO replace "oboe" with alternative library that doesn't block the Event Loop so heavily
                //      review the following libraries:
                //      - https://gitlab.com/philbooth/bfj
                //      - https://github.com/ibmruntimes/yieldable-json
                //      or consider moving parsing to a separate Worker/Process
                oboe(readableStream)
                    .done((parsed) => {
                        this.logger.verbose(`"oboe" end`);
                        resolve(parsed);
                    })
                    .fail((error) => {
                        this.logger.error(`"oboe" fail`, error);
                        reject(error);
                    });
            });
        };

        this.write = async (data) => {
            this.logger.info("write()");

            this.logger.verbose(`"msgpack.encode" start`);
            const serializedData = (() => {
                const encoded = msgpack.encode(data);
                return Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength);
            })();
            this.logger.verbose(`"msgpack.encode" end`);

            const encryptedData = await encryptionAdapter.write(serializedData);
            const {header, cipher} = persistencePartsUtil.split(encryptedData);

            header.serialization = {type: "msgpack"};

            return persistencePartsUtil.concat(header, cipher);
        };
    }
}
