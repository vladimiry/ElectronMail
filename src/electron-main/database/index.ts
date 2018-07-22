import {flatten} from "ramda";
import {IdbQuery} from "nano-sql/lib/query/std-query";
import {transformAndValidate, TransformValidationOptions} from "class-transformer-validator";
import {ValidationError} from "class-validator";

import * as DatabaseModel from "src/shared/model/database";
import {Entities} from "./entity";
import {getColumnModel} from "./entity/column-decorator";
import {nSQL} from "./nano-sql";

export async function connect() {
    for (const table of ((stub: Record<DatabaseModel.EntityTable, null>) => Object.keys(stub) as DatabaseModel.EntityTable[])(
        {Mail: null},
    )) {
        nSQL(table).model(getColumnModel(Entities[table]));
    }

    // needs to be called before "connect"
    nSQL().queryFilter(alterQuery);

    await nSQL().connect();
}

async function alterQuery(dbExec: IdbQuery): Promise<IdbQuery> {
    const entityClass = dbExec.table in Entities ? Entities[dbExec.table as DatabaseModel.EntityTable] : null;

    // TODO consider enabling entity validation and transforming for "select" query action too
    if (dbExec.action !== "upsert" || !entityClass) {
        return dbExec;
    }

    const entities = Array.isArray(dbExec.actionArgs) ? dbExec.actionArgs : [dbExec.actionArgs];

    for (const entity of entities) {
        entity.pk = generateEntityPk(entity);
        // entity.pk = null;
    }

    try {
        const actionArgs = await transformAndValidate(entityClass, entities, transformValidationOptions);
        return {...dbExec, actionArgs};
    } catch (e) {
        throw generateValidationError(e) || e;
    }
}

const transformValidationOptions: TransformValidationOptions = {
    validator: {
        whitelist: true, // stripe out unknown properties
        validationError: {target: false}, // do not attach to error object an entity being validated
    },
};

function generateEntityPk({type, login, id}: DatabaseModel.BasePersisted): DatabaseModel.BasePersisted["pk"] {
    // TODO hash the value
    return JSON.stringify({type, login, id});
}

function generateValidationError(e: Error): Error | null {
    if (!Array.isArray(e)) {
        return null;
    }

    const errors: ValidationError[] = flatten(e);
    const messages: string[] = [];

    if (!errors.length || !(errors[0] instanceof ValidationError)) {
        throw e;
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
