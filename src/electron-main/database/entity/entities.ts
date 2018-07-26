import "reflect-metadata";
import {IsArray, IsBoolean, IsIn, IsInt, IsJSON, IsNotEmpty, IsString, ValidateNested} from "class-validator";
import {Type} from "class-transformer";

import * as DatabaseModel from "src/shared/model/database";
import {AccountType} from "src/shared/model/account";
import {Column} from "./column-decorator";
import {Timestamp} from "src/shared/types";

// TODO consider enabling @Entity class annotation with table name property

export abstract class Base implements DatabaseModel.Base {
    @IsJSON()
    @IsNotEmpty()
    @IsString()
    @Column({type: "string"})
    raw!: string;
}

export class BasePersisted extends Base implements DatabaseModel.BasePersisted {
    @IsNotEmpty()
    @IsString()
    @Column({type: "string", props: ["pk()"]})
    pk!: string;

    @IsIn(((typesMap: Record<AccountType, null>) => Object.keys(typesMap))({protonmail: null, tutanota: null}))
    @IsNotEmpty()
    @IsString()
    @Column({type: "string"})
    type!: AccountType;

    @IsNotEmpty()
    @IsString()
    @Column({type: "string"})
    login!: string;

    @IsNotEmpty()
    @IsString()
    @Column({type: "string"})
    id!: string;
}

class MailAddress extends Base implements DatabaseModel.MailAddress {
    @IsNotEmpty()
    @IsString()
    address!: string;

    @IsString()
    name!: string;
}

class File extends Base implements DatabaseModel.File {
    @IsString()
    mimeType?: string;

    @IsString()
    name!: string;

    @IsNotEmpty()
    @IsInt()
    size!: number;
}

class Folder extends Base implements DatabaseModel.Folder {
    @IsNotEmpty()
    @IsInt()
    type!: DatabaseModel.MailFolderTypeValue;

    @IsString()
    name!: string;
}

export class Mail extends BasePersisted implements DatabaseModel.Mail {
    @IsNotEmpty()
    @IsInt()
    @Column({type: "int"})
    date!: Timestamp;

    @IsNotEmpty()
    @IsString()
    @Column({type: "string"})
    subject!: string;

    @IsString()
    @Column({type: "string"})
    body!: string;

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => Folder)
    @Column({type: "map"})
    folder!: Folder;

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => MailAddress)
    @Column({type: "map"})
    sender!: MailAddress;

    @ValidateNested()
    @IsArray()
    @Type(() => MailAddress)
    @Column({type: "array"})
    toRecipients!: MailAddress[];

    @ValidateNested()
    @IsArray()
    @Type(() => MailAddress)
    @Column({type: "array"})
    ccRecipients!: MailAddress[];

    @ValidateNested()
    @IsArray()
    @Type(() => MailAddress)
    @Column({type: "array"})
    bccRecipients!: MailAddress[];

    @ValidateNested()
    @IsArray()
    @Type(() => File)
    @Column({type: "array"})
    attachments!: File[];

    @IsNotEmpty()
    @IsBoolean()
    @Column({type: "bool"})
    unread!: boolean;
}
