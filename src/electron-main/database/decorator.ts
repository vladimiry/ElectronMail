import {DataModel} from "src/electron-main/database/nano-sql";

import {Base} from "./entity";
import {Omit} from "src/shared/types";

const columnsDataModelRegistry: Array<{ target: typeof Base.prototype.constructor, model: DataModel }> = [];

export function Column(
    model: Omit<DataModel, "key"> & Partial<Pick<DataModel, "key">>,
): <T extends Base>(object: T, propertyName: string) => void {
    return (object, propertyName) => {
        columnsDataModelRegistry.push({
            target: object.constructor,
            model: {key: propertyName, ...model},
        });
    };
}

export function getColumnModel<T extends typeof Base>(target: T): DataModel[] {
    const items: DataModel[] = [];

    while (typeof target === "function") {
        items.push(
            ...columnsDataModelRegistry
                .filter((item) => item.target === target)
                .map(({model}) => model),
        );
        target = Object.getPrototypeOf(target);
    }

    return items;
}
