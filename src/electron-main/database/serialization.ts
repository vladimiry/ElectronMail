import * as msgpack from "@msgpack/msgpack";
import _logger from "electron-log";
import WriteStreamAtomic from "fs-write-stream-atomic";
import fs from "fs";
import fsBackwardsStream from "fs-backwards-stream";
import oboe from "oboe";
import path from "path";
import zlib from "zlib";
import {Deferred} from "ts-deferred";
import {EncryptionAdapter, KeyBasedFileHeader} from "fs-json-store-encryption-adapter";
import {Readable} from "stream";
import {promisify} from "util";

import {Database} from ".";
import {FsDb} from "src/shared/model/database";
import {ONE_MB_BYTES} from "src/shared/constants";
import {curryFunctionMembers, getRandomInt} from "src/shared/util";

const logger = curryFunctionMembers(_logger, __filename);

const fsAsync = { // TODO use "fs/promises" (at the moment there is no "read" function for some reason)
    open: promisify(fs.open),
    read: promisify(fs.read),
    readFile: promisify(fs.readFile),
    close: promisify(fs.close),
} as const;

type DataMapSerializationHeaderPart = DeepReadonly<{
    type: "msgpack"
    dataMap?: {
        compression?: "gzip"
        items: Array<{ byteLength: number }>
    }
}>;

type DataMapItemSerializationHeaderPart = DeepReadonly<{ dataMapItem?: boolean }>;

type SerializationHeader = DeepReadonly<{
    serialization?: DataMapSerializationHeaderPart | DataMapItemSerializationHeaderPart
} & {
    [k in keyof KeyBasedFileHeader]?: KeyBasedFileHeader[k]
}>;

export const buildSerializer: (file: string) => {
    read: (encryptionAdapter: EncryptionAdapter) => Promise<FsDb>
    write: (encryptionAdapter: EncryptionAdapter, data: DeepReadonly<FsDb>) => Promise<void>
} = (() => {
    const constants = {
        gzip: "gzip",
        zero: 0,
        minusOne: -1,
        fileReadFlag: "r",
        headerZeroByteMark: Buffer.from([0o0]),
        headerReadingBufferSize: 50,
        dataReadingBufferSize: ONE_MB_BYTES,
        dataWritingBufferSize: ONE_MB_BYTES,
        mailsPortionSize: {min: 800, max: 1000}, // TODO make the mails portion size configurable
    } as const;
    const decryptBuffer = async (
        data: Buffer,
        encryptionAdapter: EncryptionAdapter,
        compression?: typeof constants.gzip,
    ): Promise<Readable> => {
        const decrypted = Readable.from(
            await encryptionAdapter.read(data),
            {highWaterMark: constants.dataReadingBufferSize},
        );
        return compression === constants.gzip
            ? decrypted.pipe(zlib.createGunzip())
            : decrypted;
    };
    const serializeDataMapItem = async (
        data: DeepReadonly<FsDb> | DeepReadonly<FsDb["accounts"]>,
        encryptionAdapter: EncryptionAdapter,
        compression: typeof constants.gzip,
    ): Promise<Buffer> => {
        const msgpacked = msgpack.encode(data);
        const msgpackBuffer = Buffer.from(msgpacked.buffer, msgpacked.byteOffset, msgpacked.byteLength);
        const encryptedData = await encryptionAdapter.write(
            compression === constants.gzip
                ? await promisify(zlib[constants.gzip])(msgpackBuffer)
                : msgpackBuffer,
        );
        const encryptionHeaderBuffer = encryptedData.slice(constants.zero, encryptedData.indexOf(constants.headerZeroByteMark));
        const encryptionHeader = JSON.parse(encryptionHeaderBuffer.toString()) as Required<SerializationHeader>["encryption"];
        const serializationHeader: SerializationHeader = {...encryptionHeader, serialization: {dataMapItem: true}};
        return Buffer.concat([
            Buffer.from(JSON.stringify(serializationHeader)),
            constants.headerZeroByteMark,
            encryptedData.slice(encryptionHeaderBuffer.length + 1),
        ]);
    };
    const readFileBytes = async (
        file: string,
        {byteCountToRead, fileOffsetStart = constants.zero}: { byteCountToRead: number, fileOffsetStart?: number },
    ): Promise<Buffer> => {
        // TODO consider reusing the buffer with dynamic size increasing if previously used is too small (GC doesn't kick in immediately)
        const result = Buffer.alloc(byteCountToRead);
        const fileHandle: number = await fsAsync.open(file, constants.fileReadFlag);
        try {
            await fsAsync.read(fileHandle, result, constants.zero, byteCountToRead, fileOffsetStart);
        } finally {
            try {
                await fsAsync.close(fileHandle);
            } catch {
                // NOOP
            }
        }
        return result;
    };
    const readSummaryHeader = async (
        file: string,
        headerPosition?: "start" | "end",
    ): Promise<{ value: SerializationHeader, payloadOffsetStart: number }> => {
        if (!headerPosition) {
            const startHeader = await readSummaryHeader(file, "start");
            const {serialization} = startHeader.value;
            if (typeof serialization !== "object") {
                return startHeader; // case: backward compatibility support (before "msgpack" introduction)
            }
            if ("dataMapItem" in serialization && Boolean(serialization.dataMapItem)) {
                return readSummaryHeader(file, "end"); // case: primary / v4.12.2+
            }
            // case: v4.12.2 WIP build shared only once here https://github.com/vladimiry/ElectronMail/issues/406#issuecomment-850574547
            // TODO throw "Header resolving failed..."-like error after v4.12.2 got released
            return startHeader;
        }

        const {headerReadingBufferSize: highWaterMark, headerZeroByteMark} = constants;
        const fromEnd = headerPosition === "end";
        const stream = fromEnd
            ? fsBackwardsStream(file, {block: highWaterMark}) // this stream is not iterable, so "await-for-of" can't be used
            : fs.createReadStream(file, {highWaterMark});
        return new Promise<Unpacked<ReturnType<typeof readSummaryHeader>>>((resolve, reject) => {
            let buffer: Buffer = Buffer.from([]);
            stream.once("error", reject);
            stream.once("end", () => { // header is required, so it's expected to be resolved before the "end" event gets fired
                reject(new Error(`Failed to locate header of the ${file} file (trigger: stream "end" event)`));
            });
            stream.on("data", (fileChunk: Buffer) => {
                const index = fileChunk[fromEnd ? "lastIndexOf" : "indexOf"](headerZeroByteMark);
                const found = index !== constants.minusOne;
                const concatParts = [
                    buffer,
                    found
                        ? (
                            fromEnd
                                ? fileChunk.slice(index + 1)
                                : fileChunk.slice(constants.zero, index)
                        )
                        : fileChunk
                ];
                buffer = Buffer.concat( // TODO use "push / unshift" on array (without dereferencing, so "const" variable)
                    concatParts[fromEnd ? "reverse" : "slice"](),
                );
                if (found) {
                    resolve({
                        value: JSON.parse(buffer.toString()), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                        payloadOffsetStart: fromEnd
                            ? constants.zero
                            : buffer.byteLength + headerZeroByteMark.byteLength,
                    });
                    return;
                }
                if (buffer.byteLength > ONE_MB_BYTES) { // TODO header is normally much much smaller, consider reducing the limit
                    reject(
                        new Error(
                            `Failed to locate header in extreme ${buffer.byteLength} bytes of ${file} file (from end: ${String(fromEnd)})`,
                        ),
                    );
                }
            });
        }).finally(() => {
            if (fromEnd) {
                // just calling "destroy" is not enough to close/stop the "fs-backwards-stream"-based stream
                // so "end => close" gets called on "fs-backwards-stream"-based stream
                // calling "end" seems to be sufficient, so "close" called just in case
                const {end, close} = stream as unknown as {
                    [k in keyof Pick<import("stream").Writable & import("stream").Pipe, "end" | "close">]?: (this: typeof stream) => void
                };
                for (const method of [end, close] as const) {
                    if (typeof method === "function") {
                        method.call(stream);
                    }
                }
            }
            stream.destroy();
        });
    };
    const result: typeof buildSerializer = (file) => {
        const {readLogger, writeLogger} = (() => {
            return {
                readLogger: curryFunctionMembers(logger, path.basename(file), "read"),
                writeLogger: curryFunctionMembers(logger, path.basename(file), "write"),
            } as const;
        })();

        return {
            async read(encryptionAdapter) {
                readLogger.verbose("start");

                const {value: {serialization}, payloadOffsetStart} = await readSummaryHeader(file);
                const serializationType = serialization && "type" in serialization && serialization.type;
                const serializationDataMap = serialization && "dataMap" in serialization && serialization.dataMap;

                readLogger.verbose(JSON.stringify({serializationType, serializationDataMap}));

                if (serializationType !== "msgpack") { // backward compatibility support (before "msgpack" introduction)
                    const decryptedReadable = await decryptBuffer(
                        await fsAsync.readFile(file),
                        encryptionAdapter,
                    );
                    return new Promise((resolve, reject) => {
                        readLogger.verbose(`${nameof(oboe)} start`);
                        // TODO replace "oboe" with alternative library that doesn't block the "event loop" so heavily:
                        //      - https://gitlab.com/philbooth/bfj
                        //      - https://github.com/ibmruntimes/yieldable-json
                        //      or consider moving parsing to a separate Worker/Process
                        oboe(decryptedReadable)
                            .done((parsed) => {
                                readLogger.verbose(`${nameof(oboe)} end`);
                                resolve(parsed);
                            })
                            .fail((error) => {
                                readLogger.error(`${nameof(oboe)} fail`, error);
                                reject(error);
                            });
                    });
                }

                if (!serializationDataMap) { // backward compatibility support
                    const db = await msgpack.decodeAsync(
                        await decryptBuffer(
                            await fsAsync.readFile(file),
                            encryptionAdapter,
                        ),
                    ) as FsDb;
                    readLogger.verbose("end");
                    return db;
                }

                let fileOffsetStart = payloadOffsetStart;
                let resultDb: DeepReadonly<FsDb> | undefined;

                // parallel processing is not used by desing, so memory use peaks get reduced (GC doesn't kick in immediately)
                for (const {byteLength} of serializationDataMap.items) {
                    const fileOffsetEnd = fileOffsetStart + byteLength;
                    const item = await readFileBytes(
                        file,
                        {fileOffsetStart: fileOffsetStart, byteCountToRead: fileOffsetEnd - fileOffsetStart},
                    );

                    fileOffsetStart = fileOffsetEnd;

                    if (!resultDb) { // first iteration
                        resultDb = await msgpack.decodeAsync(
                            await decryptBuffer(item, encryptionAdapter, serializationDataMap.compression),
                        ) as DeepReadonly<FsDb>;
                    } else { // merging the mails resolved by this iteration into the previously/during-first-iteration created database
                        const dbWithOnlyMailsFilled = await msgpack.decodeAsync(
                            await decryptBuffer(item, encryptionAdapter, serializationDataMap.compression),
                        ) as DeepReadonly<FsDb["accounts"]>;

                        for (const [login, {mails: mailsPatch}] of Object.entries(dbWithOnlyMailsFilled)) {
                            const mailsTarget = resultDb.accounts[login]?.mails;
                            if (typeof mailsTarget !== "object") {
                                throw new Error(`Unexpected "${nameof(mailsTarget)}" type: ${typeof mailsTarget}`);
                            }
                            Object.assign(mailsTarget, mailsPatch);
                        }
                    }
                }

                if (!resultDb) {
                    throw new Error("Unable to deserialize the incomplete data");
                }

                readLogger.verbose("end");

                return resultDb as FsDb;
            },
            async write(encryptionAdapter, inputDb) {
                writeLogger.verbose("start");

                type DataMap = NoExtraProps<Required<DataMapSerializationHeaderPart["dataMap"]>>;
                const dataMap: Pick<DataMap, "compression"> & import("ts-essentials").DeepWritable<Pick<DataMap, "items">> =
                    {compression: constants.gzip /* TODO make "compression" configurable */, items: []};
                const fileStream = (() => {
                    const stream = new WriteStreamAtomic(file, {highWaterMark: constants.dataWritingBufferSize, encoding: "binary"});
                    const streamErrorDeferred = new Deferred<void>();
                    let closePromise: Promise<void> | undefined;
                    stream.once("error", (error) => streamErrorDeferred.reject(error));
                    return {
                        closePromise,
                        errorHandlingPromise: streamErrorDeferred.promise,
                        async write(chunk: Buffer): Promise<void> {
                            closePromise ??= new Promise((resolve) => stream.once("close", resolve));
                            return new Promise<void>((resolve, reject) => { // TODO TS "promisify(write)" rather than wrapping in promise
                                stream.write(chunk, (error) => {
                                    if (error) {
                                        streamErrorDeferred.reject(error); // TODO remove this line: error already handled in "close" event
                                        return reject(error);
                                    }
                                    resolve();
                                });
                            });
                        },
                        end(): void {
                            stream.write(
                                Buffer.concat([
                                    constants.headerZeroByteMark,
                                    Buffer.from(
                                        JSON.stringify({serialization: {type: "msgpack", dataMap}}),
                                    ),
                                ]),
                            );
                            stream.end();
                            stream.destroy();
                            streamErrorDeferred.resolve();
                        },
                    } as const;
                })();
                const writeDataMapItem = async (data: DeepReadonly<FsDb> | DeepReadonly<FsDb["accounts"]>): Promise<void> => {
                    const serializedDb = await serializeDataMapItem(data, encryptionAdapter, dataMap.compression);
                    await fileStream.write(serializedDb);
                    dataMap.items.push({byteLength: serializedDb.byteLength});
                };

                await Promise.all([
                    fileStream.errorHandlingPromise,

                    (async () => {
                        try {
                            { // serializing initial data structure (full db but with empty "mails")
                                const accountsWithEmptyMails: DeepReadonly<FsDb["accounts"]> = Object.entries(inputDb.accounts).reduce(
                                    (accountsAccumulator, [login, account]) => {
                                        const accountWithoutMailsShallowCopy: typeof account = {...account, mails: {}};
                                        return {...accountsAccumulator, [login]: accountWithoutMailsShallowCopy};
                                    },
                                    {} as DeepReadonly<FsDb["accounts"]>,
                                );
                                const dbWithEmptyMails: typeof inputDb = {...inputDb, accounts: accountsWithEmptyMails};
                                await writeDataMapItem(dbWithEmptyMails);
                            }

                            { // serializing emails split into the portions
                                const mailsPortion: {
                                    bufferDb: FsDb["accounts"],
                                    portionSizeCounter: number,
                                    readonly portionSizeLimit: number
                                } = {
                                    bufferDb: {},
                                    portionSizeCounter: constants.zero,
                                    portionSizeLimit: getRandomInt(constants.mailsPortionSize.min, constants.mailsPortionSize.max),
                                };
                                const writeMailsPortion = async (): Promise<void> => {
                                    await writeDataMapItem(mailsPortion.bufferDb);
                                    mailsPortion.bufferDb = {};
                                    mailsPortion.portionSizeCounter = constants.zero;
                                };

                                for (const [login, account] of Object.entries(inputDb.accounts)) {
                                    for (const [mailPk, mail] of Object.entries(account.mails)) {
                                        mailsPortion.portionSizeCounter++;
                                        (mailsPortion.bufferDb[login] ??= Database.buildEmptyAccount()).mails[mailPk] = mail;

                                        if (mailsPortion.portionSizeCounter === mailsPortion.portionSizeLimit) {
                                            await writeMailsPortion(); // serializing mails portion
                                        }
                                    }
                                }

                                if (mailsPortion.portionSizeCounter) {
                                    await writeMailsPortion(); // serializing "remaining / incomplete" mails portion
                                }
                            }

                            fileStream.end();
                        } finally {
                            if (fileStream.closePromise) {
                                await fileStream.closePromise;
                            }
                        }
                    })(),
                ]);

                writeLogger.verbose("end");
            },
        };
    };
    return result;
})();
