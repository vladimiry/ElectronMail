import {pick} from "ramda";

import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "src/electron-preload/webview/tutanota/lib/rest";
import {buildBaseEntity} from ".";

export function buildContact(input: Rest.Model.Contact): DatabaseModel.Contact {
    return {
        ...buildBaseEntity(input),
        ...pick(["comment", "company", "firstName", "lastName", "nickname", "role", "title"], input),
        addresses: input.addresses.map(ContactAddress),
        birthday: input.birthday ? Birthday(input.birthday) : undefined,
        mailAddresses: input.mailAddresses.map(ContactMailAddress),
        phoneNumbers: input.phoneNumbers.map(ContactPhoneNumber),
        socialIds: input.socialIds.map(ContactSocialId),
    };
}

function ContactAddress(input: Rest.Model.ContactAddress): DatabaseModel.ContactAddress {
    return {
        ...buildBaseEntity(input),
        type: DatabaseModel.CONTACT_ADDRESS_TYPE._.parse(input.type),
        customTypeName: input.customTypeName,
        address: input.address,
    };
}

function Birthday(input: Rest.Model.Birthday): DatabaseModel.Birthday {
    return {
        ...buildBaseEntity(input),
        ...pick(["day", "month", "year"], input),
    };
}

function ContactMailAddress(input: Rest.Model.ContactMailAddress): DatabaseModel.ContactMailAddress {
    return {
        ...buildBaseEntity(input),
        type: DatabaseModel.CONTACT_ADDRESS_TYPE._.parse(input.type),
        customTypeName: input.customTypeName,
        address: input.address,
    };
}

function ContactSocialId(input: Rest.Model.ContactSocialId): DatabaseModel.ContactSocialId {
    return {
        ...buildBaseEntity(input),
        type: DatabaseModel.CONTACT_SOCIAL_TYPE._.parse(input.type),
        customTypeName: input.customTypeName,
        socialId: input.socialId,
    };
}

function ContactPhoneNumber(input: Rest.Model.ContactPhoneNumber): DatabaseModel.ContactPhoneNumber {
    return {
        ...buildBaseEntity(input),
        type: DatabaseModel.CONTACT_PHONE_NUMBER_TYPE._.parse(input.type),
        customTypeName: input.customTypeName,
        number: input.number,
    };
}
