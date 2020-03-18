declare module "pureimage" {
    import {Writable} from "stream";
    import {ReadStream} from "fs";

    interface Bitmap {
        data: Buffer;
        width: number;
        height: number;

        getContext(arg: "2d"): Context;

        setPixelRGBA(x: number, y: number, rgba: number): void;

        getPixelRGBA(x: number, y: number): number;
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

    function encodePNGToStream(bitmap: Bitmap, stream: Writable): Promise<void>;

    function registerFont(binaryPath: string, family: string, weight?: number, style?: string, variant?: string): {
        binary: string;
        family: string;
        weight?: number;
        style?: string;
        variant?: string;
        loaded: boolean;
        font: null | any; // eslint-disable-line @typescript-eslint/no-explicit-any
        load: (cb: () => void) => void;
    };

    function make(width: number, heigt: number): Bitmap;
}
