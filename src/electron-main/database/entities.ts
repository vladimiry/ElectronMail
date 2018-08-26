import "reflect-metadata";
import {IsArray, IsBoolean, IsIn, IsInt, IsJSON, IsNotEmpty, IsString, ValidateNested} from "class-validator";
import {Type} from "class-transformer";

import * as DatabaseModel from "src/shared/model/database";
import {MailFolderTypeService} from "src/shared/util";
import {Timestamp} from "src/shared/types";

// TODO consider enabling @Entity class annotation with table name property

export abstract class Entity implements DatabaseModel.Entity {
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

class MailAddress extends Entity implements DatabaseModel.MailAddress {
    @IsNotEmpty()
    @IsString()
    address!: string;

    @IsString()
    name!: string;
}

class File extends Entity implements DatabaseModel.File {
    @IsString()
    mimeType?: string;

    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsNotEmpty()
    @IsInt()
    size!: number;
}

export class Folder extends Entity implements DatabaseModel.Folder {
    @IsNotEmpty()
    @IsIn(MailFolderTypeService.values())
    folderType!: DatabaseModel.MailFolderTypeValue;

    @IsString()
    name!: string;
}

export class Mail extends Entity implements DatabaseModel.Mail {
    @IsNotEmpty()
    @IsInt()
    date!: Timestamp;

    @IsNotEmpty()
    @IsString()
    subject!: string;

    @IsString()
    body!: string;

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => MailAddress)
    sender!: MailAddress;

    @ValidateNested()
    @IsArray()
    @Type(() => MailAddress)
    toRecipients!: MailAddress[];

    @ValidateNested()
    @IsArray()
    @Type(() => MailAddress)
    ccRecipients!: MailAddress[];

    @ValidateNested()
    @IsArray()
    @Type(() => MailAddress)
    bccRecipients!: MailAddress[];

    @ValidateNested()
    @IsArray()
    @Type(() => File)
    attachments!: File[];

    @IsNotEmpty()
    @IsBoolean()
    unread!: boolean;
}
