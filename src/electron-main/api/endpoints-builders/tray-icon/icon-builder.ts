import {Bitmap, decodePNGFromStream, encodePNGToStream, make, registerFont} from "pureimage";
import {NativeImage, nativeImage} from "electron";
import {PassThrough} from "stream";
import {createReadStream} from "fs";
import {lanczos} from "@rgba-image/lanczos";
import {platform} from "os";

import {CircleConfig, ImageBundle} from "./model";

// TODO explore https://github.com/vonderheide/mono-bitmap as a possible "pureimage" replacement

const bitmapToNativeImage = (() => {
    const darwinSize = Object.freeze({width: 16, height: 16}); // macOS uses 16x16 tray icon
    const platformSpecificScale: (source: Bitmap) => Promise<Bitmap> = platform() === "darwin"
        ? async (source) => {
            const sourceBits = source.data.byteLength / (source.width * source.height);
            const dest = {
                data: Uint8ClampedArray.from(new Array(darwinSize.width * darwinSize.height * sourceBits)),
                ...darwinSize,
            };

            lanczos(
                {
                    data: Uint8ClampedArray.from(source.data),
                    width: source.width,
                    height: source.height,
                },
                dest,
            );

            const result = make(dest.width, dest.height);

            result.data = Buffer.from(dest.data);

            return result;
        }
        : async (source) => source;

    return async (source: Bitmap): Promise<NativeImage> => {
        return nativeImage.createFromBuffer(
            await encodePNGToBuffer(
                await platformSpecificScale(source),
            ),
        );
    };
})();

export async function trayIconBundleFromPath(trayIconPath: string): Promise<ImageBundle> {
    const bitmap = await decodePNGFromStream(createReadStream(trayIconPath));

    return {
        bitmap,
        native: await bitmapToNativeImage(bitmap),
    };
}

export async function loggedOutBundle({bitmap: source}: ImageBundle, config: CircleConfig): Promise<ImageBundle> {
    const rad = (source.width * config.scale) / 2;
    const circle = buildCircle(rad, config.color);
    const {width, height} = circle;
    const bitmap = cloneBitmap(source);

    skipSettingTransparentPixels(bitmap);
    bitmap.getContext("2d").drawImage(circle, 0, 0, width, height, 0, 0, width, height);

    return {
        bitmap,
        native: await bitmapToNativeImage(bitmap),
    };
}

export async function unreadNative(
    unread: number,
    fontFilePath: string,
    {bitmap: source}: ImageBundle,
    config: CircleConfig & { textColor: string },
): Promise<{
    icon: NativeImage,
    overlay: NativeImage,
}> {
    const circle = await (async (text, fontFamily) => {
        const rad = (source.width * config.scale) / 2;
        const textDrawArea = buildCircle(rad, config.color);

        if (!text || text.length > 2) {
            text = "+";
        }

        const scale = text.length === 1 ? 1.6 : 1.35;
        const size = rad * scale;
        const x = size - rad * 1.1;
        const y = size + rad * scale * (text.length - 1) * .1;
        const ctx = textDrawArea.getContext("2d");

        await new Promise((resolve) => registerFont(fontFilePath, fontFamily).load(resolve));

        ctx.fillStyle = config.textColor;
        ctx.font = `${size}pt ${fontFamily}`;
        ctx.fillText(text, x, y);

        return textDrawArea;
    })(String(unread), "some-font-family");
    const {width, height} = circle;
    const icon = cloneBitmap(source);

    skipSettingTransparentPixels(icon);

    icon
        .getContext("2d")
        .drawImage(circle, 0, 0, width, height, icon.width - width, icon.height - height, width, height);

    return {
        icon: await bitmapToNativeImage(icon),
        overlay: await bitmapToNativeImage(circle),
    };
}

function buildCircle(rad: number, color: string): Bitmap {
    const bitmap = make(rad * 2, rad * 2);
    const ctx = bitmap.getContext("2d");

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(bitmap.width - rad, bitmap.height - rad, rad, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();

    return bitmap;
}

function skipSettingTransparentPixels(bitmap: Bitmap): void {
    bitmap.setPixelRGBA = ((setPixelRGBA) => function(this: typeof bitmap, x: number, y: number, rgba: number) {
        if (rgba === 0) {
            return;
        }
        return setPixelRGBA.call(this, x, y, rgba);
    })(bitmap.setPixelRGBA);
}

async function encodePNGToBuffer(source: Bitmap): Promise<Buffer> {
    return await new Promise<Buffer>((resolve, reject) => {
        const stream = new PassThrough();
        const data: number[] = [];

        stream
            .on("data", (chunk: typeof data) => data.push(...chunk))
            .on("error", (error) => reject(error))
            .on("end", () => {
                encodingPromise
                    .then(() => resolve(Buffer.from(data)))
                    .catch(reject);
            });

        const encodingPromise = encodePNGToStream(source, stream);
    });
}

function cloneBitmap(input: Pick<Bitmap, "width" | "height" | "data">): Bitmap {
    const output = make(input.width, input.height);

    output.data = Buffer.from(input.data);

    return output;
}
