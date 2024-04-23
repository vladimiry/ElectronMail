declare module "fs-write-stream-atomic" {
    import {Writable, WritableOptions} from "stream";
    import {WritableStateOptions} from "readable-stream";

    class WriteStreamAtomic extends Writable {
        public constructor(
            path: string,
            options?: NoExtraProps<
                WritableOptions & WritableStateOptions & {
                    chown?: {uid: number; guid: number};
                    encoding?: BufferEncoding;
                    flags?: import("fs").OpenMode;
                    mode?: import("fs").Mode;
                }
            >,
        );
    }

    export = WriteStreamAtomic;
}
