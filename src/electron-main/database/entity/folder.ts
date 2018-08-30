import {IsIn, IsString} from "class-validator";

import * as Model from "src/shared/model/database";
import {Entity} from "./base";

export class Folder extends Entity implements Model.Folder {
    @IsIn(Model.MAIL_FOLDER_TYPE._.values)
    folderType!: string;

    @IsString()
    name!: string;
}
