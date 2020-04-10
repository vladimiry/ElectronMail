import {Entity} from "src/electron-preload/webview/lib/rest-model/response-entity/base";
import {LABEL_TYPE} from "src/electron-preload/webview/lib/rest-model/constats";
import {NumberBoolean} from "src/electron-preload/webview/lib/rest-model/common";

export interface Label<TypeRecord = typeof LABEL_TYPE._.nameValueMap> extends Entity {
    Color: string;
    Display: NumberBoolean;
    Exclusive: number;
    Name: string;
    Notify: NumberBoolean;
    Order: number;
    Type: TypeRecord[keyof TypeRecord];
}
