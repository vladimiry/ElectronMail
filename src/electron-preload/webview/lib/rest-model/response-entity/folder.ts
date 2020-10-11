import {Entity} from "src/electron-preload/webview/lib/rest-model/response-entity/base";
import {LABEL_TYPE} from "src/shared/model/database";
import {NumericBoolean} from "src/shared/model/common";

export interface Label<TypeRecord = typeof LABEL_TYPE._.nameValueMap> extends Entity {
    Color: string;
    Display: NumericBoolean;
    Name: string;
    Notify: NumericBoolean;
    Order: number;
    Type: TypeRecord[keyof TypeRecord];
}
