import {flatten} from "ramda";
import {IdbQuery} from "nano-sql/lib/query/std-query";
import {transformAndValidate, TransformValidationOptions} from "class-transformer-validator";
import {ValidationError} from "class-validator";
import {Entities, PersistenceEntities, Table} from "./entity";
import {getColumnModel} from "./decorator";
import {nSQL} from "./nano-sql";

export async function connect() {
    for (const table of ((stub: Record<Table, null>) => Object.keys(stub) as Table[])(
        {Mail: null},
    )) {
        nSQL(table).model(getColumnModel(PersistenceEntities[table]));
    }

    // needs to be called before "connect"
    nSQL().queryFilter(queryFilterCallBack);

    await nSQL().connect();
}

const transformValidationOptions: TransformValidationOptions = {
    validator: {
        whitelist: true, // stripe out unknown properties
        validationError: {target: false}, // do not attach to error object an entity being validated
    },
};

const throwValidationError = (e: Error) => {
    if (!Array.isArray(e)) {
        throw e;
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

    throw new Error(messages.join("; "));
};

const queryFilterCallBack: (args: IdbQuery, complete: (args: IdbQuery) => void) => void = async (dbExec, complete) => {
    const {table} = dbExec;

    if (dbExec.action !== "upsert" || !(table in Entities)) {
        complete(dbExec);
        return;
    }

    try {
        const persistenceEntity = Entities[table as Table];
        const actionArgs = await transformAndValidate(persistenceEntity, dbExec.actionArgs, transformValidationOptions);
        complete({...dbExec, actionArgs});
    } catch (e) {
        throwValidationError(e);
    }
};
