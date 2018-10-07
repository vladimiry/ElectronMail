import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "src/electron-preload/webview/protonmail/lib/rest";
import {buildBaseEntity} from ".";

// TODO properly fill "DatabaseModel.Contact"
export function buildContact(input: Rest.Model.Contact): DatabaseModel.Contact {
    return {
        ...buildBaseEntity(input),
        comment: "",
        company: "",
        firstName: "",
        lastName: "",
        // nickname?: string;
        role: "",
        // title?: string;
        addresses: [],
        birthday: undefined,
        mailAddresses: (input.ContactEmails || []).map(ContactMailAddress),
        phoneNumbers: [],
        socialIds: [],
    };
}

// TODO properly fill "DatabaseModel.ContactMailAddress"
function ContactMailAddress(input: Rest.Model.ContactEmail): DatabaseModel.ContactMailAddress {
    return {
        ...buildBaseEntity(input),
        type: DatabaseModel.CONTACT_ADDRESS_TYPE.OTHER,
        customTypeName: JSON.stringify(input.Type),
        address: input.Email,
    };
}
