import {buildBaseEntity} from "src/electron-preload/webview/lib/database-entity/index";
import * as DatabaseModel from "src/shared/model/database";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";

// TODO properly fill "DatabaseModel.ContactMailAddress"
function ContactMailAddress(input: RestModel.ContactEmail): DatabaseModel.ContactMailAddress {
    return {
        ...buildBaseEntity(input),
        type: DatabaseModel.CONTACT_ADDRESS_TYPE.OTHER,
        customTypeName: JSON.stringify(input.Type),
        address: input.Email,
    };
}

// TODO properly fill "DatabaseModel.Contact"
export function buildContact(input: RestModel.Contact): DatabaseModel.Contact {
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
