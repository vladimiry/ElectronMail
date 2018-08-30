import {IsArray, IsBoolean, IsInt, IsNotEmpty, IsString, ValidateNested} from "class-validator";
import {Type} from "class-transformer";

import * as Model from "src/shared/model/database";
import {Entity} from "./base";
import {Timestamp} from "src/shared/types";

class MailAddress extends Entity implements Model.MailAddress {
    @IsNotEmpty()
    @IsString()
    address!: string;

    @IsString()
    name!: string;
}

class File extends Entity implements Model.File {
    @IsString()
    mimeType?: string;

    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsNotEmpty()
    @IsInt()
    size!: number;
}

export class Mail extends Entity implements Model.Mail {
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
