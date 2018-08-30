import {IsJSON, IsNotEmpty, IsString} from "class-validator";

import * as Model from "src/shared/model/database";

export abstract class Entity implements Model.Entity {
    @IsNotEmpty()
    @IsString()
    pk!: string;

    @IsJSON()
    @IsNotEmpty()
    @IsString()
    raw!: string;

    @IsNotEmpty()
    @IsString()
    id!: string;
}
