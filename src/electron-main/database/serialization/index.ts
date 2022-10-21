import electronLog from "electron-log";
import type {EncryptionAdapter} from "fs-json-store-encryption-adapter";
import fsAsync from "fs/promises";
import path from "path";

import {
    buildFileStream, CONST, decryptBuffer, msgpackr, portionSizeLimit, readFileBytes, readSummaryHeader, serializeDataMapItem,
} from "./util";
import {Config} from "src/shared/model/options";
import {curryFunctionMembers} from "src/shared/util";
import {Database} from "src/electron-main/database";
import type {FsDb} from "src/shared/model/database";
import * as Model from "./model";

const _logger = curryFunctionMembers(electronLog, __filename);

export const buildSerializer: (file: string) => {
    read: (encryptionAdapter: EncryptionAdapter) => Promise<FsDb>
    write: (
        encryptionAdapter: EncryptionAdapter,
        data: DeepReadonly<FsDb>,
        dbCompression: DeepReadonly<Config["dbCompression2"]>,
    ) => Promise<void>
} = (file) => {
    return {
        read: (() => {
            const logger = curryFunctionMembers(_logger, path.basename(file), "read");
            return async (encryptionAdapter) => {
                logger.verbose("start");
                const {value: {serialization}, payloadOffsetStart} = await readSummaryHeader(file);
                const serializationType = serialization && "type" in serialization && serialization.type;
                const serializationDataMap = serialization && "dataMap" in serialization && serialization.dataMap;

                logger.verbose(JSON.stringify({serializationType, serializationDataMap}));

                if (serializationType !== "msgpack") {
                    throw new Error("Too old local store database format");
                }

                if (!serializationDataMap) { // backward compatibility support
                    const db = msgpackr.unpack(
                        await decryptBuffer(
                            await fsAsync.readFile(file),
                            encryptionAdapter,
                        ),
                    ) as FsDb;
                    logger.verbose("end");
                    return db;
                }

                let fileOffsetStart = payloadOffsetStart;
                let resultDb: DeepReadonly<FsDb> | undefined;
                let readFileBytesSharedBuffer: Buffer | undefined; // using shared buffer to reduce memory allocation peaks

                // parallel processing is not used by desing, so memory use peaks get reduced (GC doesn't kick in immediately)
                for (const {byteLength} of serializationDataMap.items) {
                    const fileOffsetEnd = fileOffsetStart + byteLength;
                    const byteCountToRead = fileOffsetEnd - fileOffsetStart;

                    if (!readFileBytesSharedBuffer) {
                        readFileBytesSharedBuffer = Buffer.alloc(byteCountToRead);
                    } else if (readFileBytesSharedBuffer.byteLength < byteCountToRead) {
                        readFileBytesSharedBuffer = Buffer.concat([
                            readFileBytesSharedBuffer,
                            Buffer.alloc(byteCountToRead - readFileBytesSharedBuffer.byteLength)
                        ]);
                    }

                    const item = await readFileBytes(
                        readFileBytesSharedBuffer,
                        file,
                        {fileOffsetStart, byteCountToRead},
                    );

                    fileOffsetStart = fileOffsetEnd;

                    if (!resultDb) { // first iteration
                        resultDb = msgpackr.unpack(
                            await decryptBuffer(item, encryptionAdapter, serializationDataMap.compression),
                        ) as DeepReadonly<FsDb>;
                    } else { // merging the mails resolved by this iteration into the previously/during-first-iteration created database
                        const dbWithOnlyMailsFilled = msgpackr.unpack(
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

                logger.verbose("end");

                return resultDb as FsDb;
            };
        })(),

        write: (() => {
            const logger = curryFunctionMembers(_logger, path.basename(file), "write");
            return async (encryptionAdapter, inputDb, compressionOpts) => {
                logger.verbose("start");
                type DataMap = NoExtraProps<Required<Model.DataMapSerializationHeaderPart["dataMap"]>>;
                const dataMap: Pick<DataMap, "compression"> & import("ts-essentials").DeepWritable<Pick<DataMap, "items">> =
                    {compression: compressionOpts.type, items: []};
                const fileStream = buildFileStream(file);
                const writeDataMapItem = async (data: DeepReadonly<FsDb> | DeepReadonly<FsDb["accounts"]>): Promise<void> => {
                    const serializedDb = await serializeDataMapItem(
                        logger,
                        msgpackr,
                        data,
                        encryptionAdapter,
                        dataMap.compression,
                        compressionOpts.level,
                    );
                    await fileStream.write(serializedDb);
                    dataMap.items.push({byteLength: serializedDb.byteLength});
                };

                await Promise.all([
                    fileStream.finishPromise,
                    (async () => {
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
                                portionSizeLimit: portionSizeLimit(compressionOpts.mailsPortionSize),
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

                        await fileStream.finish({serialization: {type: "msgpack", dataMap}});
                    })(),
                ]);

                logger.verbose("end");
            };
        })(),
    };
};
