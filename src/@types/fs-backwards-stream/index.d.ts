declare module "fs-backwards-stream" {
    import {Readable} from "stream";

    export default function(
        file: string,
        opts?: { block?: number },
    ): Pick<Readable, "on" | "once" | "destroy">;
}
