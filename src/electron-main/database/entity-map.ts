import {ClassType, transformAndValidate, TransformValidationOptions} from "class-transformer-validator";
import {ValidationError} from "class-validator";
import {flatten} from "ramda";

import {Entity, EntityMap as EntityMapInterface} from "src/shared/model/database";

export class EntityMap<K extends Entity["pk"], V extends Entity> implements EntityMapInterface<K, V> {
    private readonly transformValidationOptions: TransformValidationOptions = {
        validator: {
            whitelist: true, // stripe out unknown properties
            validationError: {target: false}, // do not attach to error object an entity being validated
        },
    };

    constructor(private readonly valueClassType: ClassType<V>, private readonly map = new Map<K, V>()) {}

    get size() {
        return this.map.size;
    }

    entries() {
        return this.map.entries();
    }

    keys() {
        return this.map.keys();
    }

    values() {
        return this.map.values();
    }

    clear() {
        this.map.clear();
    }

    delete(key: K) {
        return this.map.delete(key);
    }

    forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any) {
        return this.map.forEach(callbackfn, thisArg);
    }

    get(key: K) {
        return this.map.get(key);
    }

    async set(value: V): Promise<this> {
        let valueInstance: V;

        try {
            valueInstance = await transformAndValidate(this.valueClassType, value, this.transformValidationOptions);
        } catch (e) {
            throw this.generateValidationError(e) || e;
        }

        const validatedValue = JSON.parse(JSON.stringify(valueInstance));

        this.map.set(valueInstance.pk as K, validatedValue);

        return this;
    }

    has(key: K) {
        return this.map.has(key);
    }

    private generateValidationError(e: Error): Error | null {
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
}
