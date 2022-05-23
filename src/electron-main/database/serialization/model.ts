import type {EncryptionAdapter, KeyBasedFileHeader} from "fs-json-store-encryption-adapter";

import type {Config} from "src/shared/model/options";
import type {FsDb} from "src/shared/model/database";

export type DataMapSerializationHeaderPart = DeepReadonly<{
    type: "msgpack"
    dataMap?: {
        readonly compression?: Config["dbCompression"]["type"]
        readonly items: Array<{ byteLength: number }>
    }
}>;

export type DataMapItemSerializationHeaderPart = DeepReadonly<{ dataMapItem?: boolean }>;

export type SerializationHeader = DeepReadonly<{
    serialization?: DataMapSerializationHeaderPart | DataMapItemSerializationHeaderPart
} & {
    [k in keyof KeyBasedFileHeader]?: KeyBasedFileHeader[k]
}>;

export type buildSerializerType = (file: string) => {
    read: (encryptionAdapter: EncryptionAdapter) => Promise<FsDb>
    write: (
        encryptionAdapter: EncryptionAdapter,
        data: DeepReadonly<FsDb>,
        dbCompression: DeepReadonly<Config["dbCompression"]>,
    ) => Promise<void>
};
