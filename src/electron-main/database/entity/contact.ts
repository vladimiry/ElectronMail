import {IsArray, IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested} from "class-validator";
import {Type} from "class-transformer";

import * as Model from "src/shared/model/database";
import {Entity} from "./base";

class ContactAddress extends Entity implements Model.ContactAddress {
    @IsIn(Model.CONTACT_ADDRESS_TYPE._.values)
    type!: Model.ContactAddress["type"];

    @IsString()
    customTypeName!: Model.ContactAddress["customTypeName"];

    @IsString()
    @IsNotEmpty()
    address!: Model.ContactAddress["address"];
}

class Birthday extends Entity implements Model.Birthday {
    @IsString()
    @IsNotEmpty()
    day!: Model.Birthday["day"];

    @IsString()
    @IsNotEmpty()
    month!: Model.Birthday["month"];

    @IsOptional()
    @IsString()
    year?: Model.Birthday["year"];
}

class ContactMailAddress extends Entity implements Model.ContactMailAddress {
    @IsIn(Model.CONTACT_ADDRESS_TYPE._.values)
    type!: Model.ContactMailAddress["type"];

    @IsString()
    customTypeName!: Model.ContactMailAddress["customTypeName"];

    @IsString()
    address!: Model.ContactMailAddress["address"];
}

class ContactPhoneNumber extends Entity implements Model.ContactPhoneNumber {
    @IsIn(Model.CONTACT_PHONE_NUMBER_TYPE._.values)
    type!: Model.ContactPhoneNumber["type"];

    @IsString()
    customTypeName!: Model.ContactPhoneNumber["customTypeName"];

    @IsString()
    @IsNotEmpty()
    number!: Model.ContactPhoneNumber["number"];
}

class ContactSocialId extends Entity implements Model.ContactSocialId {
    @IsIn(Model.CONTACT_SOCIAL_TYPE._.values)
    type!: Model.ContactSocialId["type"];

    @IsString()
    customTypeName!: Model.ContactSocialId["customTypeName"];

    @IsString()
    @IsNotEmpty()
    socialId!: Model.ContactSocialId["socialId"];
}

export class Contact extends Entity implements Model.Contact {
    @IsString()
    comment!: Model.Contact["comment"];

    @IsString()
    company!: Model.Contact["company"];

    @IsString()
    firstName!: Model.Contact["firstName"];

    @IsString()
    lastName!: Model.Contact["lastName"];

    @IsOptional()
    @IsString()
    nickname?: Model.Contact["nickname"];

    @IsString()
    role!: Model.Contact["role"];

    @IsOptional()
    @IsString()
    title?: Model.Contact["title"];

    @ValidateNested()
    @IsArray()
    @Type(() => ContactAddress)
    addresses!: ContactAddress[];

    @IsOptional()
    @ValidateNested()
    @Type(() => Birthday)
    birthday?: Birthday;

    @ValidateNested()
    @IsArray()
    @Type(() => ContactMailAddress)
    mailAddresses!: ContactMailAddress[];

    @ValidateNested()
    @IsArray()
    @Type(() => ContactPhoneNumber)
    phoneNumbers!: ContactPhoneNumber[];

    @ValidateNested()
    @IsArray()
    @Type(() => ContactSocialId)
    socialIds!: ContactSocialId[];
}
