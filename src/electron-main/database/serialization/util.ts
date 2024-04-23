import {Deferred} from "ts-deferred";
import type {EncryptionAdapter} from "fs-json-store-encryption-adapter";
import fs from "fs";
import fsBackwardsStream from "fs-backwards-stream";
import {gunzip, gzip} from "zlib";
import {Packr} from "msgpackr";
import {promisify} from "util";
import WriteStreamAtomic from "fs-write-stream-atomic";

import type {Config} from "src/shared/model/options";
import type {FsDb} from "src/shared/model/database";
import {getRandomInt} from "src/shared/util";
import type {Logger} from "src/shared/model/common";
import type * as Model from "./model";
import {ONE_MB_BYTES} from "src/shared/const";

// TODO use "fs/promises" (at the moment there is no "read" function for some reason)
const fsAsync = {open: promisify(fs.open), read: promisify(fs.read), close: promisify(fs.close)} as const;
const zlibAsync = {gunzip: promisify(gunzip), gzip: promisify(gzip)} as const;
export const msgpackr = new Packr({useRecords: false, moreTypes: false, structuredClone: false, int64AsNumber: true});

export const CONST = {
    zero: 0,
    minusOne: -1,
    headerZeroByteMark: Buffer.from([0o0]),
    headerReadingBufferSize: 50,
    dataReadingBufferSize: ONE_MB_BYTES,
    dataWritingBufferSize: ONE_MB_BYTES,
    mailsPortionSize: {min: 400, max: 5000},
    compressionLevelsFallback: {gzip: 6, zstd: 7},
} as const;

const resolveZstdWasm = (() => {
    let lib: typeof import("@oneidentity/zstd-js/wasm")["ZstdSimple"] | undefined;
    return async () => {
        if (!lib) {
            const {ZstdInit} = await import("@oneidentity/zstd-js/wasm");
            const {ZstdSimple} = await ZstdInit();
            lib = ZstdSimple;
        }
        return lib;
    };
})();

export const decryptBuffer = async (
    data: Buffer,
    encryptionAdapter: EncryptionAdapter,
    compressionType?: Config["dbCompression2"]["type"],
): Promise<Buffer> => {
    const decryptedBuffer = await encryptionAdapter.read(data);
    return compressionType === "gzip"
        ? zlibAsync.gunzip(decryptedBuffer)
        : (compressionType === "zstd")
        ? Buffer.from((await resolveZstdWasm()).decompress(decryptedBuffer))
        : decryptedBuffer;
};

export const serializeDataMapItem = async (
    logger: Logger,
    msgpackr: Packr,
    data: DeepReadonly<FsDb> | DeepReadonly<FsDb["accounts"]>,
    encryptionAdapter: EncryptionAdapter,
    compressionType: Config["dbCompression2"]["type"],
    level: Config["dbCompression2"]["level"],
): Promise<Buffer> => {
    if (
        typeof level !== "number"
        || level < 1
        || (compressionType === "gzip" && level > 9)
        || (compressionType === "zstd" && level > 22)
    ) {
        level = CONST.compressionLevelsFallback[compressionType];
        logger.error(`Invalid "${nameof(level)}" value, falling back to the default value: ${level}`);
    }
    const serializedData = msgpackr.pack(data);
    const serializedDataBuffer = Buffer.from(serializedData.buffer, serializedData.byteOffset, serializedData.byteLength);
    const encryptedData = await encryptionAdapter.write(
        compressionType === "gzip"
            ? await zlibAsync.gzip(serializedDataBuffer, {level})
            // TODO explore the "zstd" library payload size limitation: min 100 bytes
            // eslint-disable-next-line max-len
            // https://github.com/OneIdentity/zstd-js/blob/d9de2d24e6b61ae9d3cf86c2838a117555c1e835/src/components/common/zstd-simple/zstd-simple.ts#L23
            : (compressionType === "zstd" && serializedDataBuffer.byteLength > 100)
            ? Buffer.from((await resolveZstdWasm()).compress(serializedDataBuffer, level))
            : serializedDataBuffer,
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

export const readSummaryHeader = async (
    file: string,
    headerPosition?: "start" | "end",
): Promise<{value: Model.SerializationHeader; payloadOffsetStart: number}> => {
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
                    ? (fromEnd
                        ? fileChunk.slice(index + 1)
                        : fileChunk.slice(CONST.zero, index))
                    : fileChunk,
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
                [k in keyof Pick<import("stream").Writable & import("stream").Pipe, "end" | "close">]?: (this: typeof stream) => void;
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

export const buildFileStream = (
    file: string,
): {
    finishPromise: Promise<void>;
    write: (chunk: Buffer) => Promise<void>;
    finish: (serializationHeader: Model.SerializationHeader) => Promise<void>;
} => {
    const stream = new WriteStreamAtomic(file, {highWaterMark: CONST.dataWritingBufferSize, encoding: "binary"});
    const streamDeferred = new Deferred<void>();
    const write = async (chunk: Buffer): Promise<void> => {
        const writeDeferred = new Deferred<void>();
        await Promise.all([
            writeDeferred.promise,
            new Promise<void>((resolve, reject) => {
                if (
                    !stream.write(chunk, (error) => {
                        if (error) return reject(error);
                        writeDeferred.resolve();
                    })
                ) {
                    stream.once("drain", resolve);
                } else {
                    resolve();
                }
            }),
        ]);
    };
    stream.once("error", (error) => streamDeferred.reject(error));
    stream.once("finish", () => streamDeferred.resolve());
    return {
        finishPromise: streamDeferred.promise,
        write,
        async finish(serializationHeader) {
            await write(Buffer.concat([CONST.headerZeroByteMark, Buffer.from(JSON.stringify(serializationHeader))]));
            await new Promise<void>((resolve) => stream.end(resolve));
        },
    };
};

export const portionSizeLimit = (mailsPortionSize: Readonly<Config["dbCompression2"]["mailsPortionSize"]>): number => {
    const clampInRangeLimit = (value: number): number => Math.min(Math.max(value, CONST.mailsPortionSize.min), CONST.mailsPortionSize.max);
    const min = clampInRangeLimit(mailsPortionSize.min);
    const max = clampInRangeLimit(mailsPortionSize.max);
    return getRandomInt(Math.min(min, max), Math.max(min, max));
};

export const readFileBytes = async (
    buffer: Buffer,
    file: string,
    {byteCountToRead, fileOffsetStart}: {byteCountToRead: number; fileOffsetStart: number},
): Promise<Buffer> => {
    const fileHandle = await fsAsync.open(file, "r");
    try {
        await fsAsync.read(fileHandle, buffer, 0, byteCountToRead, fileOffsetStart);
    } finally {
        try {
            await fsAsync.close(fileHandle);
        } catch {
            // NOOP
        }
    }
    return buffer.slice(0, byteCountToRead);
};
