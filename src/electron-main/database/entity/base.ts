import {IsIn, IsNotEmpty, IsOptional, IsString} from "class-validator";

import * as Model from "src/shared/model/database";

export abstract class Entity implements Model.Entity {
    @IsNotEmpty()
    @IsString()
    pk!: Model.Entity["pk"];

    @IsNotEmpty()
    @IsString()
    raw!: Model.Entity["raw"];

    @IsIn(["lzutf8"])
    @IsOptional()
    rawCompression!: Model.Mail["rawCompression"];

    @IsNotEmpty()
    @IsString()
    id!: Model.Entity["id"];
}
