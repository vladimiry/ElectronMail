import {IsIn, IsInt, IsNotEmpty, IsString} from "class-validator";

import * as Model from "src/shared/model/database";
import {Entity} from "./base";

export class Folder extends Entity implements Model.Folder {
    @IsIn(Model.MAIL_FOLDER_TYPE._.values)
    folderType!: Model.Folder["folderType"];

    @IsString()
    name!: Model.Folder["name"];

    @IsNotEmpty()
    @IsString()
    mailFolderId!: Model.Folder["mailFolderId"];

    @IsInt()
    exclusive!: Model.Folder["exclusive"];
}
