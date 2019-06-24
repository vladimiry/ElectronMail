import _logger from "electron-log";
import {ClassType, TransformValidationOptions, transformAndValidate} from "class-transformer-validator";
import {ValidationError} from "class-validator";
import {flatten} from "ramda";

import * as Entities from "./entity";
import {Entity, FsDbDataContainer, ValidatedEntity} from "src/shared/model/database";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[src/electron-main/database/validation]");

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
        return JSON.parse(
            JSON.stringify(validatedEntityInstance),
        );
    } catch (e) {
        logger.error(e);
        throw generateValidationError(e);
    }
}

function generateValidationError(rawError: Error): Error {
    if (!Array.isArray(rawError)) {
        return rawError;
    }

    const errors: ValidationError[] = flatten(rawError);
    const messages: string[] = [];

    if (!errors.length || !(errors[0] instanceof ValidationError)) {
        return rawError;
    }

    while (errors.length) {
        const error = errors.shift();

        if (!error) {
            continue;
        }

        messages.push(error.property + ": " + JSON.stringify(error.constraints));

        if (error.children) {
            errors.push(...error.children);
        }
    }

    return new Error(messages.join("; "));
}
