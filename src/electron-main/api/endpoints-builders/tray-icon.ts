import Jimp from "jimp";
import {app, NativeImage, nativeImage} from "electron";
import {EMPTY, from} from "rxjs";
import {promisify} from "util";

import {Context} from "src/electron-main/model";
import {ElectronContextLocations} from "src/shared/model/electron";
import {Endpoints} from "src/shared/api/main";

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<Endpoints, "updateOverlayIcon">> {
    const icons = await prepareTrayIcons(ctx.locations);

    return {
        // TODO replace Jimp with something more lightweight and easier to use
        updateOverlayIcon: ({hasLoggedOut, unread}) => from((async () => {
            const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;
            const tray = ctx.uiContext && ctx.uiContext.tray;

            if (!browserWindow || !tray) {
                return EMPTY.toPromise();
            }

            const {buildOverlay} = icons;
            const main = hasLoggedOut ? icons.mainLoggedOut : icons.main;

            if (unread > 0) {
                const overlayJimp = buildOverlay(unread);
                const overlayBuffer = await promisify(overlayJimp.getBuffer.bind(overlayJimp))(Jimp.MIME_PNG);
                const overlayNative = nativeImage.createFromBuffer(overlayBuffer);
                const overlaySize = {w: overlayJimp.bitmap.width, h: overlayJimp.bitmap.height};
                const composedJimp = main.jimp.composite(overlayJimp, main.w - overlaySize.w, main.h - overlaySize.h);
                const composedBuffer = await promisify(composedJimp.getBuffer.bind(composedJimp))(Jimp.MIME_PNG);
                const composedNative = nativeImage.createFromBuffer(composedBuffer);

                browserWindow.setOverlayIcon(overlayNative, `Unread messages count: ${unread}`);
                tray.setImage(composedNative);
                app.setBadgeCount(unread);
            } else {
                browserWindow.setOverlayIcon(null as any, "");
                tray.setImage(main.native);
                app.setBadgeCount(0);
            }

            return EMPTY.toPromise();
        })()),
    };
}

export async function prepareTrayIcons(locations: ElectronContextLocations): Promise<{
    main: { native: NativeImage, jimp: Jimp, w: number, h: number },
    mainLoggedOut: { native: NativeImage, jimp: Jimp, w: number, h: number },
    buildOverlay: (unread: number) => Jimp,
}> {
    const main = await (async () => {
        const native = nativeImage.createFromPath(locations.trayIcon);
        const jimp = await Jimp.read(native.toPNG());

        return Object.freeze({
            native,
            jimp,
            w: jimp.bitmap.width,
            h: jimp.bitmap.height,
        });
    })();
    const mainLoggedOut = await (async () => {
        const overlayNative = nativeImage.createFromPath(locations.trayIconLoggedOutOverlay);
        const overlayJimp = await Jimp.read(overlayNative.toPNG());
        const composedJimp = main.jimp.clone().composite(overlayJimp, 0, 0);
        const composedBuffer = await promisify(composedJimp.getBuffer.bind(composedJimp))(Jimp.MIME_PNG);
        const composedNative = nativeImage.createFromBuffer(composedBuffer);

        return Object.freeze({
            native: composedNative,
            jimp: composedJimp,
            w: composedJimp.bitmap.width,
            h: composedJimp.bitmap.height,
        });
    })();

    const buildOverlay = await (async () => {
        const factors = {overlay: .75, text: .9};
        const size = {w: Math.round(main.w * factors.overlay), h: Math.round(main.h * factors.overlay)};
        const imageSource = await Jimp.read(nativeImage.createFromPath(locations.trayIconUnreadOverlay).toPNG());
        const jimp = await promisify(imageSource.resize.bind(imageSource))(size.w, size.h);
        // TODO there is no "loadFont" function signature described in Jimp's declaration file
        const font = await (Jimp as any).loadFont(Jimp.FONT_SANS_64_WHITE);
        const fontSize = 64;
        const printX = [
            30,
            8,
        ];
        const printY = size.h / 2 - (fontSize / 2);

        return (unread: number) => {
            const index = String(unread).length - 1;

            if (index < printX.length) {
                return jimp.clone().print(font, printX[index], printY, String(unread), size.w * factors.text);
            }

            return jimp;
        };
    })();

    return {
        main,
        mainLoggedOut,
        buildOverlay,
    };
}
