import fs from "fs";
import memoryStreams from "memory-streams";
import pureimage, {Bitmap, decodePNGFromStream, encodePNGToStream, registerFont} from "pureimage";
import {NativeImage, nativeImage} from "electron";

// TODO explore https://github.com/vonderheide/mono-bitmap as a possible "pureimage" replacement

export interface CircleConfig {
    scale: number;
    color: string;
}

export interface ImageBundle {
    bitmap: Bitmap;
    native: NativeImage;
}

export async function trayIconBundleFromPath(trayIconPath: string): Promise<ImageBundle> {
    const bitmap = await decodePNGFromStream(fs.createReadStream(trayIconPath));

    return {
        bitmap,
        native: nativeImage.createFromBuffer(await convertBitmapToBuffer(bitmap)),
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
        native: nativeImage.createFromBuffer(await convertBitmapToBuffer(bitmap)),
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
    const rad = (source.width * config.scale) / 2;
    const circle = buildCircle(rad, config.color);

    await (async (text, fontFamily) => {
        if (!text || text.length > 2) {
            text = "+";
        }
        const scale = text.length === 1 ? 1.6 : 1.35;
        const size = rad * scale;
        const x = size - rad * 1.1;
        const y = size + rad * scale * (text.length - 1) * .1;
        await new Promise((resolve) => registerFont(fontFilePath, fontFamily).load(resolve));
        const ctx = circle.getContext("2d");
        ctx.fillStyle = config.textColor;
        ctx.font = `${size}pt ${fontFamily}`;
        ctx.fillText(text, x, y);
    })(String(unread), "some-font-family");

    const {width, height} = circle;
    const bitmap = cloneBitmap(source);

    skipSettingTransparentPixels(bitmap);
    bitmap.getContext("2d").drawImage(circle, 0, 0, width, height, bitmap.width - width, bitmap.height - height, width, height);

    return {
        icon: nativeImage.createFromBuffer(await convertBitmapToBuffer(bitmap)),
        overlay: nativeImage.createFromBuffer(await convertBitmapToBuffer(circle)),
    };
}

function buildCircle(rad: number, color: string): Bitmap {
    const bitmap = pureimage.make(rad * 2, rad * 2);
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

function cloneBitmap(input: Bitmap): Bitmap {
    const output = pureimage.make(input.width, input.height);

    output.data = Buffer.from(input.data);

    return output;
}

async function convertBitmapToBuffer(bitmap: Bitmap): Promise<Buffer> {
    const stream = new memoryStreams.WritableStream();

    await encodePNGToStream(bitmap, stream);

    return stream.toBuffer();
}
