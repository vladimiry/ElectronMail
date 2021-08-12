import {Logger} from "src/shared/model/common";
import {resolveIpcMainApi} from "src/electron-preload/lib/util";

class ProtonOpenNewTabEvent extends CustomEvent<{ url: string }> {
    static readonly eventType = "electron-mail:../../packages/shared/lib/helpers/browser.ts:openNewTab";

    constructor(detail: { url: string }) {
        super(ProtonOpenNewTabEvent.eventType, {detail});
    }
}

declare global {
    interface WindowEventMap {
        [ProtonOpenNewTabEvent.eventType]: ProtonOpenNewTabEvent
    }
}

export const setupProtonOpenNewTabEventHandler = (logger: Logger): void => {
    const openExternal = resolveIpcMainApi({logger})("openExternal");

    window.addEventListener(ProtonOpenNewTabEvent.eventType, async ({detail: {url}}) => {
        await openExternal({url}); // eslint-disable-line @typescript-eslint/no-floating-promises
    });
};
