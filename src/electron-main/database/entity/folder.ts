import {IsIn, IsInt, IsString} from "class-validator";

import * as Model from "src/shared/model/database";
import {Entity} from "./base";

export class Folder extends Entity implements Model.Folder {
    @IsString()
    name!: Model.Folder["name"];

    @IsIn(Model.LABEL_TYPE._.values)
    type!: Model.Folder["type"];

    @IsInt()
    notify!: Model.Folder["notify"];
}
