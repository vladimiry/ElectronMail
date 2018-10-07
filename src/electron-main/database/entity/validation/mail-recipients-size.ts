import {ValidationArguments, ValidationOptions, registerDecorator} from "class-validator";

import * as Model from "src/shared/model/database";
import {Mail} from "src/electron-main/database/entity/mail";

export function mailRecipientsSize(validationOptions?: ValidationOptions) {
    return (object: Mail, propertyName: keyof Pick<Model.Mail, "toRecipients">) => {
        registerDecorator({
            name: "mailRecipientsSize",
            target: object.constructor,
            propertyName,
            options: validationOptions,
            validator: {
                validate(value: Model.Mail["toRecipients"], args: ValidationArguments) {
                    const mail = args.object as Model.Mail;

                    if (mail.state === Model.MAIL_STATE.DRAFT) {
                        return true;
                    }

                    return Array.isArray(mail.toRecipients) && Boolean(mail.toRecipients.length);
                },
            },
        });
    };
}
