import "zone.js";

import {ElectronExposure, ElectronWindow} from "src/shared/model/electron";

declare global {
    interface Window extends ElectronWindow {
        Zone: Zone;
    }

    const __ELECTRON_EXPOSURE__: ElectronExposure;
}

declare var window: Window;
