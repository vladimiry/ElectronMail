import {NativeImage} from "electron";

import {Bitmap} from "pureimage/types/bitmap";

export interface CircleConfig {
    readonly scale: number;
    readonly color: string;
}

export interface ImageBundle {
    readonly bitmap: Bitmap;
    readonly native: NativeImage;
}
