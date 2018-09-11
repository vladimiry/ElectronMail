import {IsJSON, IsNotEmpty, IsString} from "class-validator";

import * as Model from "src/shared/model/database";

export abstract class Entity implements Model.Entity {
    @IsNotEmpty()
    @IsString()
    pk!: Model.Entity["pk"];

    @IsJSON()
    @IsNotEmpty()
    @IsString()
    raw!: Model.Entity["raw"];

    @IsNotEmpty()
    @IsString()
    id!: Model.Entity["id"];
}
