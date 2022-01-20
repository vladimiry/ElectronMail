import lzutf8 from "lzutf8";

import {Folder, Mail} from "src/shared/model/database";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";

export const lzutf8Util: Readonly<{
    shouldCompress: (value: string) => boolean,
    compress: (value: string) => string
    decompress: (value: string) => string
}> = (() => {
    // TODO make the "min length to compress" value configurable
    const minLengthToCompress = 70;
    const options = {
        compression: {inputEncoding: "String", outputEncoding: "StorageBinaryString"},
        decompression: {inputEncoding: "StorageBinaryString", outputEncoding: "String"},
    } as const;
    const result: typeof lzutf8Util = {
        shouldCompress(value) {
            return value.length >= minLengthToCompress;
        },
        compress(value) {
            return lzutf8.compress(value, options.compression) as string;
        },
        decompress(value) {
            return lzutf8.decompress(value, options.decompression) as string;
        },
    };
    return result;
})();

// TODO move "protonmail message rest model" to shared library since being referenced from different places
export const parseProtonRestModel = <T extends Mail | Folder>(
    dbEntity: DeepReadonly<T>
): T extends Mail ? RestModel.Message : RestModel.Label => {
    return JSON.parse( // eslint-disable-line @typescript-eslint/no-unsafe-return
        dbEntity.rawCompression === "lzutf8"
            ? lzutf8Util.decompress(dbEntity.raw)
            : dbEntity.raw,
    );
};

export const readMailBody = <T extends Pick<Mail, "body" | "bodyCompression">>(
    dbEntity: DeepReadonly<T>,
): string => {
    return dbEntity.bodyCompression === "lzutf8"
        ? lzutf8Util.decompress(dbEntity.body)
        : dbEntity.body;
};
