import _logger from "electron-log";
import {Deferred} from "ts-deferred";
import type {EncryptionAdapter} from "fs-json-store-encryption-adapter";
import fs from "fs";
import fsBackwardsStream from "fs-backwards-stream";
import * as msgpack from "@msgpack/msgpack";
import oboe from "oboe";
import path from "path";
import {promisify} from "util";
import {Readable} from "stream";
import WriteStreamAtomic from "fs-write-stream-atomic";
import zlib from "zlib";

import type {Config} from "src/shared/model/options";
import {curryFunctionMembers, getRandomInt} from "src/shared/util";
import {Database} from "src/electron-main/database";
import type {FsDb} from "src/shared/model/database";
import * as Model from "./model";
import {ONE_MB_BYTES} from "src/shared/const";

const logger = curryFunctionMembers(_logger, __filename);

const fsAsync = { // TODO use "fs/promises" (at the moment there is no "read" function for some reason)
    open: promisify(fs.open),
    read: promisify(fs.read),
    readFile: promisify(fs.readFile),
    close: promisify(fs.close),
} as const;

export const buildSerializer: Model.buildSerializerType = (() => {
    const CONST = {
        zero: 0,
        minusOne: -1,
        fileReadFlag: "r",
        headerZeroByteMark: Buffer.from([0o0]),
        headerReadingBufferSize: 50,
        dataReadingBufferSize: ONE_MB_BYTES,
        dataWritingBufferSize: ONE_MB_BYTES,
        mailsPortionSize: {min: 400, max: 5000},
        compressionLevels: {gzip: 6, zstd: 8}, // TODO consider making compression type/level configurable via interface
    } as const;
    const zstdNative = (() => {
        let value: typeof import("./zstd-native") | undefined;
        return async () => value ??= await import("./zstd-native");
    })();
    const bufferToReadable = (input: Buffer): Readable => Readable.from(input, {highWaterMark: CONST.dataReadingBufferSize});
    const decryptBuffer = async (
        data: Buffer,
        encryptionAdapter: EncryptionAdapter,
        compressionType?: Config["dbCompression"]["type"],
    ): Promise<Readable> => {
        const decryptedBuffer = await encryptionAdapter.read(data);
        const decryptedReadable = bufferToReadable(decryptedBuffer);
        return compressionType === "gzip"
            ? decryptedReadable.pipe(zlib.createGunzip())
            : compressionType === "zstd"
                ? bufferToReadable( // TODO use stream-based "zstd" decompression
                    await (await zstdNative()).decompress(decryptedBuffer),
                )
                : decryptedReadable;
    };
    const serializeDataMapItem = async (
        data: DeepReadonly<FsDb> | DeepReadonly<FsDb["accounts"]>,
        encryptionAdapter: EncryptionAdapter,
        compressionType: Config["dbCompression"]["type"],
        level: Config["dbCompression"]["level"],
    ): Promise<Buffer> => {
        if (typeof level !== "number"
            ||
            level < 1
            ||
            (
                compressionType === "gzip" && level > 9
            )
            ||
            (
                compressionType === "zstd" && level > 22
            )
        ) {
            level = CONST.compressionLevels[compressionType];
            logger.error(`Invalid "${nameof(level)}" value, falling back to the default value: ${level}`);
        }
        const serializedData = msgpack.encode(data);
        const serializedDataBuffer = Buffer.from(serializedData.buffer, serializedData.byteOffset, serializedData.byteLength);
        const encryptedData = await encryptionAdapter.write(
            compressionType === "gzip"
                ? await promisify(zlib.gzip)(serializedDataBuffer, {level})
                : compressionType === "zstd"
                    ? await (await zstdNative()).compress(serializedDataBuffer, level)
                    : serializedDataBuffer
        );
        const encryptionHeaderBuffer = encryptedData.slice(CONST.zero, encryptedData.indexOf(CONST.headerZeroByteMark));
        const encryptionHeader = JSON.parse(encryptionHeaderBuffer.toString()) as Required<Model.SerializationHeader>["encryption"];
        const serializationHeader: Model.SerializationHeader = {...encryptionHeader, serialization: {dataMapItem: true}};
        return Buffer.concat([
            Buffer.from(JSON.stringify(serializationHeader)),
            CONST.headerZeroByteMark,
            encryptedData.slice(encryptionHeaderBuffer.length + 1),
        ]);
    };
    const readFileBytes = async (
        file: string,
        {byteCountToRead, fileOffsetStart = CONST.zero}: { byteCountToRead: number, fileOffsetStart?: number },
    ): Promise<Buffer> => {
        // TODO consider reusing the buffer with dynamic size increasing if previously used is too small (GC doesn't kick in immediately)
        const result = Buffer.alloc(byteCountToRead);
        const fileHandle: number = await fsAsync.open(file, CONST.fileReadFlag);
        try {
            await fsAsync.read(fileHandle, result, CONST.zero, byteCountToRead, fileOffsetStart);
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
    ): Promise<{ value: Model.SerializationHeader, payloadOffsetStart: number }> => {
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

        const {headerReadingBufferSize: highWaterMark, headerZeroByteMark} = CONST;
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
                const found = index !== CONST.minusOne;
                const concatParts = [
                    buffer,
                    found
                        ? (
                            fromEnd
                                ? fileChunk.slice(index + 1)
                                : fileChunk.slice(CONST.zero, index)
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
                            ? CONST.zero
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
    const result: Model.buildSerializerType = (file) => {
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
                                resolve(parsed); // eslint-disable-line @typescript-eslint/no-unsafe-argument
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
            async write(encryptionAdapter, inputDb, compressionOpts) {
                writeLogger.verbose("start");

                type DataMap = NoExtraProps<Required<Model.DataMapSerializationHeaderPart["dataMap"]>>;
                const dataMap: Pick<DataMap, "compression"> & import("ts-essentials").DeepWritable<Pick<DataMap, "items">> =
                    {compression: compressionOpts.type, items: []};
                const fileStream = (() => {
                    const stream = new WriteStreamAtomic(file, {highWaterMark: CONST.dataWritingBufferSize, encoding: "binary"});
                    const streamErrorDeferred = new Deferred<void>();
                    const writeToStream = async (chunk: Buffer): Promise<void> => {
                        return new Promise<void>((resolve, reject) => {
                            stream.write(chunk, (error) => {
                                if (error) {
                                    streamErrorDeferred.reject(error);
                                    return reject(error);
                                }
                                resolve();
                            });
                        });
                    };
                    let closePromise: Promise<void> | undefined;
                    stream.once("error", (error) => streamErrorDeferred.reject(error));
                    return {
                        closePromise,
                        errorHandlingPromise: streamErrorDeferred.promise,
                        async write(chunk: Buffer): Promise<void> {
                            closePromise ??= new Promise((resolve) => stream.once("close", resolve));
                            return writeToStream(chunk);
                        },
                        async finish(): Promise<void> {
                            await writeToStream(
                                Buffer.concat([
                                    CONST.headerZeroByteMark,
                                    Buffer.from(
                                        JSON.stringify({serialization: {type: "msgpack", dataMap}}),
                                    ),
                                ]),
                            );
                            await new Promise<void>((resolve) => {
                                stream.end(() => {
                                    stream.destroy();
                                    resolve();
                                });
                            });
                            streamErrorDeferred.resolve();
                        },
                    } as const;
                })();
                const writeDataMapItem = async (data: DeepReadonly<FsDb> | DeepReadonly<FsDb["accounts"]>): Promise<void> => {
                    const serializedDb = await serializeDataMapItem(data, encryptionAdapter, dataMap.compression, compressionOpts.level);
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
                                    portionSizeCounter: CONST.zero,
                                    portionSizeLimit: (() => {
                                        const clampInRangeLimit = (value: number): number => Math.min(
                                            Math.max(value, CONST.mailsPortionSize.min),
                                            CONST.mailsPortionSize.max,
                                        );
                                        const min = clampInRangeLimit(compressionOpts.mailsPortionSize.min);
                                        const max = clampInRangeLimit(compressionOpts.mailsPortionSize.max);
                                        return getRandomInt(
                                            Math.min(min, max),
                                            Math.max(min, max),
                                        );
                                    })(),
                                };
                                const writeMailsPortion = async (): Promise<void> => {
                                    await writeDataMapItem(mailsPortion.bufferDb);
                                    mailsPortion.bufferDb = {};
                                    mailsPortion.portionSizeCounter = CONST.zero;
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

                            await fileStream.finish();
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
