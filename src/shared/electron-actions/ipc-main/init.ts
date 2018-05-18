import {ElectronIpcMainActionType, IpcMainChannel} from "_shared/electron-actions/model";
import {ElectronContextLocations} from "_shared/model/electron";

export const channel = IpcMainChannel.Init;

export interface Type extends ElectronIpcMainActionType {
    c: typeof channel;
    i: void;
    o: {
        electronLocations: ElectronContextLocations;
        hasSavedPassword: boolean;
    };
}
