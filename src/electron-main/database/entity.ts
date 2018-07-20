import "reflect-metadata";
import {IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsString, ValidateNested} from "class-validator";

import * as Model from "src/shared/model/database";
import {AccountType} from "src/shared/model/account";
import {Column} from "./decorator";
import {Timestamp} from "src/shared/types";
import {Type} from "class-transformer";

// TODO consider enabling @Entity class annotation with table name property

export abstract class Base implements Model.Base {
    @IsNotEmpty()
    @IsString()
    @Column({type: "string"})
    id: string;

    @IsNotEmpty()
    @IsInt()
    @Column({type: "int"})
    date: Timestamp;
}

class MailAddress extends Base implements Model.MailAddress {
    @IsNotEmpty()
    @IsString()
    address: string;

    @IsNotEmpty()
    @IsString()
    name: string;
}

class File extends Base implements File {
    @IsString()
    mimeType?: string;

    @IsString()
    name: string;

    @IsNotEmpty()
    @IsInt()
    size: number;
}

export class Mail extends Base implements Model.Mail {
    @IsIn(((typesMap: Record<AccountType, null>) => Object.keys(typesMap))({protonmail: null, tutanota: null}))
    @IsNotEmpty()
    @IsString()
    @Column({type: "string"})
    type: AccountType;

    @IsNotEmpty()
    @IsString()
    @Column({type: "string"})
    login: string;

    @IsNotEmpty()
    @IsString()
    @Column({type: "string"})
    subject: string;

    @IsString()
    @Column({type: "string"})
    body: string;

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => MailAddress)
    @Column({type: "map"})
    sender: MailAddress;

    @ValidateNested()
    @IsArray()
    @Type(() => MailAddress)
    @Column({type: "array"})
    toRecipients: MailAddress[];

    @ValidateNested()
    @IsArray()
    @Type(() => MailAddress)
    @Column({type: "array"})
    ccRecipients: MailAddress[];

    @ValidateNested()
    @IsArray()
    @Type(() => MailAddress)
    @Column({type: "array"})
    bccRecipients: MailAddress[];

    @ValidateNested()
    @IsArray()
    @Type(() => File)
    @Column({type: "array"})
    attachments: File[];

    @IsNotEmpty()
    @IsBoolean()
    @Column({type: "bool"})
    unread: boolean;
}

class PersistentMail extends Mail implements Model.PersistentMail {
    @IsNotEmpty()
    @IsString()
    @Column({type: "timeId", props: ["pk()"]})
    pk: string;
}

const persistenceEntities = {
    Mail: PersistentMail,
};
export {
    persistenceEntities as PersistenceEntities,
};

const entities: Record<keyof typeof persistenceEntities, typeof Mail> = {
    Mail,
};
export {
    entities as Entities,
};

export type Table = keyof typeof persistenceEntities;
