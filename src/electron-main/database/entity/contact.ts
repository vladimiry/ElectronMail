import {IsArray, IsIn, IsNotEmpty, IsString, ValidateNested} from "class-validator";
import {Type} from "class-transformer";

import * as Model from "src/shared/model/database";
import {Entity} from "./base";
import {NumberString} from "src/shared/types";

class ContactAddress extends Entity implements Model.ContactAddress {
    @IsIn(Model.CONTACT_ADDRESS_TYPE._.values)
    type!: string;

    @IsString()
    customTypeName!: string;

    @IsString()
    @IsNotEmpty()
    address!: string;
}

class Birthday extends Entity implements Model.Birthday {
    @IsString()
    @IsNotEmpty()
    day!: NumberString;

    @IsString()
    @IsNotEmpty()
    month!: NumberString;

    @IsString()
    year?: NumberString;
}

class ContactMailAddress extends Entity implements Model.ContactMailAddress {
    @IsIn(Model.CONTACT_ADDRESS_TYPE._.values)
    type!: string;

    @IsString()
    customTypeName!: string;

    @IsString()
    @IsNotEmpty()
    address!: string;
}

class ContactPhoneNumber extends Entity implements Model.ContactPhoneNumber {
    @IsIn(Model.CONTACT_PHONE_NUMBER_TYPE._.values)
    type!: string;

    @IsString()
    customTypeName!: string;

    @IsString()
    @IsNotEmpty()
    number!: string;
}

class ContactSocialId extends Entity implements Model.ContactSocialId {
    @IsIn(Model.CONTACT_SOCIAL_TYPE._.values)
    type!: string;

    @IsString()
    customTypeName!: string;

    @IsString()
    @IsNotEmpty()
    socialId!: string;
}

export class Contact extends Entity implements Model.Contact {
    @IsString()
    comment!: string;

    @IsString()
    company!: string;

    @IsString()
    firstName!: string;

    @IsString()
    lastName!: string;

    @IsString()
    nickname?: string;

    @IsString()
    role!: string;

    @IsString()
    title?: string;

    @ValidateNested()
    @IsArray()
    @Type(() => ContactAddress)
    addresses!: ContactAddress[];

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
