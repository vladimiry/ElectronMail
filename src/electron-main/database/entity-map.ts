import {ClassType, TransformValidationOptions, transformAndValidate} from "class-transformer-validator";
import {ValidationError} from "class-validator";
import {flatten} from "ramda";

import {Entity, EntityMap as EntityMapInterface} from "src/shared/model/database";

export class EntityMap<V extends Entity, K extends V["pk"] = V["pk"]> implements EntityMapInterface<K, V> {
    protected static readonly transformValidationOptions: TransformValidationOptions = {
        validator: {
            whitelist: true, // stripe out unknown properties
            validationError: {target: false}, // do not attach to error object an entity being validated
        },
    };

    protected static generateValidationError(e: Error): Error {
        if (!Array.isArray(e)) {
            return e;
        }

        const errors: ValidationError[] = flatten(e);
        const messages: string[] = [];

        if (!errors.length || !(errors[0] instanceof ValidationError)) {
            return e;
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

    private readonly map = new Map<K, V>();

    constructor(
        private readonly valueClassType: ClassType<V>,
        record?: Record<K, V>,
    ) {
        if (record) {
            this.setFromObject(record);
        }
    }

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

    forEach(callback: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any) {
        return this.map.forEach(callback, thisArg);
    }

    get(key: K) {
        return this.map.get(key);
    }

    async validateAndSet(value: V): Promise<this> {
        let validatedValue: V;

        try {
            const instance = await transformAndValidate(this.valueClassType, value, EntityMap.transformValidationOptions);
            validatedValue = JSON.parse(JSON.stringify(instance));
        } catch (e) {
            throw EntityMap.generateValidationError(e);
        }

        this.map.set(validatedValue.pk as K, validatedValue);

        return this;
    }

    has(key: K) {
        return this.map.has(key);
    }

    toObject(): Record<K, V> {
        const object = Object.create(null);

        for (const [k, v] of this.map) {
            object[k] = v;
        }

        return object;
    }

    protected setFromObject(record: Record<K, V>) {
        for (const k of Object.keys(record)) {
            this.map.set(k as K, (record as any)[k]);
        }
    }
}
