declare module "pureimage" {
    import {ReadStream, WriteStream} from "fs";
    import {WritableStream} from "memory-streams";

    interface Bitmap {
        data: Buffer;
        width: number;
        height: number;

        getContext(arg: "2d"): Context;

        setPixelRGBA(x: number, y: number, rgba: number): void;
    }

    interface Context {
        globalAlpha: 0 | 1;
        fillStyle: string;
        font: string;

        arc(x: number, y: number, rad: number, start: number, end: number, clockwise: boolean): void;

        beginPath(): void;

        closePath(): void;

        drawImage(image: Bitmap, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;

        fill(): void;

        fillText(text: string, x: number, y: number): void;
    }

    function decodePNGFromStream(stream: ReadStream): Promise<Bitmap>;

    function encodePNGToStream(bitmap: Bitmap, stream: WriteStream | WritableStream): Promise<void>;

    function registerFont(binaryPath: string, family: string, weight?: number, style?: string, variant?: string): {
        binary: string,
        family: string,
        weight?: number,
        style?: string,
        variant?: string,
        loaded: boolean;
        font: null | any;
        load: (cb: () => void) => void;
    };

    function make(width: number, heigt: number): Bitmap;
}
