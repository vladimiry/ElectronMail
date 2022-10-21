import type {KeyBasedFileHeader} from "fs-json-store-encryption-adapter";

import type {Config} from "src/shared/model/options";

export type DataMapSerializationHeaderPart = DeepReadonly<{
    type: "msgpack"
    dataMap?: {
        readonly compression?: Config["dbCompression2"]["type"]
        readonly items: Array<{ byteLength: number }>
    }
}>;

export type DataMapItemSerializationHeaderPart = DeepReadonly<{ dataMapItem?: boolean }>;

export type SerializationHeader = DeepReadonly<{
    serialization?: DataMapSerializationHeaderPart | DataMapItemSerializationHeaderPart
} & {
    [k in keyof KeyBasedFileHeader]?: KeyBasedFileHeader[k]
}>;
