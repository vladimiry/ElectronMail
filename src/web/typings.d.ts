import "zone.js";

import {ElectronExposure, ElectronWindow} from "src/shared/model/electron";

declare module "*.html" {
    const _: string;
    export default _;
}

declare module "*.scss" {
    const _: string;
    export default _;
}

declare global {
    interface Window extends ElectronWindow {
        Zone: Zone;
    }

    const __ELECTRON_EXPOSURE__: ElectronExposure;
}

declare var window: Window;
