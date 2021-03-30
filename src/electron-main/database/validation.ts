import _logger from "electron-log";
import {ClassType, TransformValidationOptions, transformAndValidate} from "class-transformer-validator";
import {ValidationError} from "class-validator";
import {flatten} from "remeda";

import * as Entities from "./entity";
import {Contact, Entity, Folder, FsDbDataContainer, Mail, ValidatedEntity} from "src/shared/model/database";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, __filename);

const transformValidationOptions: TransformValidationOptions = {
    validator: {
        // stripe out unknown properties
        whitelist: true,
        // do not attach to error object an entity being validated
        validationError: {target: false},
    },
};

const entityClassesMap = {
    conversationEntries: Entities.ConversationEntry,
    mails: Entities.Mail,
    folders: Entities.Folder,
    contacts: Entities.Contact,
} as const;

function flattenValidationError(rawError: Error): Error | string {
    if (!Array.isArray(rawError)) {
        return rawError;
    }

    const errors: ValidationError[] = flatten(rawError); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    const messages: string[] = [];

    if (!errors.length || !(errors[0] instanceof ValidationError)) {
        return rawError;
    }

    while (errors.length) {
        const error = errors.shift();

        if (!error) {
            continue;
        }

        messages.push(
            error.property
            +
            ": "
            +
            Object.entries(error.constraints ?? {})
                .map(([key, value]) => `${key}: ${value}`)
                .join(", "),
        );

        if (error.children) {
            errors.push(...error.children);
        }
    }

    return messages.join("; ");
}

export async function validateEntity<T extends Entity>(
    entityType: keyof FsDbDataContainer,
    entity: T,
): Promise<T & ValidatedEntity> {
    const classType = entityClassesMap[entityType] as unknown as ClassType<T>;

    try {
        const validatedEntityInstance = await transformAndValidate(
            classType,
            entity,
            transformValidationOptions,
        );

        // TODO performance: why JSON.parse <= JSON.stringify call?
        return JSON.parse( // eslint-disable-line @typescript-eslint/no-unsafe-return
            JSON.stringify(validatedEntityInstance),
        );
    } catch (e) {
        logger.error("original validation error", e);

        IPC_MAIN_API_NOTIFICATION$.next(
            IPC_MAIN_API_NOTIFICATION_ACTIONS.ErrorMessage({
                message: "Local database entity validation error has occurred: " + JSON.stringify({
                    entityType,
                    ...(() => { // eslint-disable-line @typescript-eslint/explicit-function-return-type
                        if (entityType === "mails") {
                            return {
                                sentDate: (entity as unknown as Mail).sentDate,
                                subject: (entity as unknown as Mail).subject,
                            };
                        }
                        if (entityType === "contacts") {
                            return {
                                firstName: (entity as unknown as Contact).firstName,
                                lastName: (entity as unknown as Contact).lastName,
                            };
                        }
                        if (entityType === "folders") {
                            return {
                                folderName: (entity as unknown as Folder).name,
                            };
                        }
                        return {};
                    })(),
                    error: flattenValidationError(e),
                }),
            }),
        );

        throw new Error(
            `Local database saving and data syncing iterations aborted due to the "${entityType}" entity validation error`,
        );
    }
}
