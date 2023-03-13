import type {ActionCreator, ActionCreatorProps, Creator} from "@ngrx/store";
import {mapKeys} from "remeda";
import type {NotAllowedInPropsCheck} from "@ngrx/store/src/models";
import type {ValueOf} from "ts-essentials";

type MatchPropName = "match";

type TypedAction<T extends string> = { readonly type: T };

type RawObject = object; // eslint-disable-line @typescript-eslint/ban-types

type PropsRecord = { [T in string]: ActionCreatorProps<RawObject> | null } & { [K in MatchPropName]?: never };

type ActionsRecord<P extends PropsRecord = PropsRecord> = {
    [T in Extract<keyof P, string>]: P[T] extends ActionCreatorProps<RawObject>
        ? ActionCreator<T,
            (props: P[T]["_p"] /* & NotAllowedCheck<P[T]["_p"]> */) => { payload: P[T]["_p"] } & TypedAction<T>>
        : ActionCreator<T, () => TypedAction<T>>
};

// @ts-expect-error // TODO get rid of "ts-expect-error" thing
export type UnionOf<T extends ActionsRecord> = Exclude<ReturnType<ValueOf<Omit<StrictOmit<T, MatchPropName>, symbol | number>>>, boolean>; // eslint-disable-line @typescript-eslint/ban-types, max-len

export type UnionOfRecord<P extends PropsRecord, T extends ActionsRecord<P> = ActionsRecord<P>>
    = { [K in Exclude<keyof T, MatchPropName>]: ReturnType<T[K]> };

type Cases<Record, A> = {
    [T in keyof Record]: (
        value: Record[T] extends { payload: infer P }
            ? P
            : void
    ) => A
};

type Match<P extends PropsRecord> = <A>(
    variant: UnionOf<ActionsRecord<P>>,
    cases:
        | Cases<UnionOfRecord<P>, A> & { default?: never }
        | Partial<Cases<UnionOfRecord<P>, A>> & { default: (variant: UnionOf<ActionsRecord<P>>) => A }
) => A;

// picked from https://github.com/ngrx/platform/blob/fb78f7394765608ecf4718bba6a3df16a43e8913/modules/store/src/action_creator.ts#L128
// TODO enable automatic picking
export const props = <P extends SafeProps, SafeProps = NotAllowedInPropsCheck<P>>(): ActionCreatorProps<P> => {
    return {_as: "props", _p: undefined!}; // eslint-disable-line @typescript-eslint/no-non-null-assertion
};

const defineType = <T extends string>(type: TypedAction<T>["type"], creator: Creator): ActionCreator<T> => {
    return Object.defineProperty(creator, 'type', {value: type, writable: false}) as ActionCreator<T>;
};

// TODO actions: freeze the result
export const propsRecordToActionsRecord = <P extends PropsRecord>(
    value: P,
    {prefix}: { prefix: string },
): ActionsRecord<P>
    & { [K in MatchPropName]: Match<P> }
    // @ts-expect-error // TODO get rid of "ts-expect-error" thing
    & { is: (value: UnionOf<ActionsRecord>) => value is UnionOf<ActionsRecord<P>> } => {
    const prefixedTypes = new Set<string>();
    const resolvePrefixedType = (key: keyof P): string => {
        const result = `${prefix}:${String(key)}`;
        prefixedTypes.add(result);
        return result;
    };
    return {
        ...Object.entries(value).reduce(
            (accumulator, [key, actionCreatorProps]) => {
                const type = resolvePrefixedType(key);
                return {
                    ...accumulator,
                    [key]: actionCreatorProps
                        ? defineType(type, (value: typeof actionCreatorProps._p) => ({payload: value, type}))
                        : defineType(type, () => ({type})),
                };
            },
            {} as ActionsRecord<P>,
        ),
        match(value, matchers) {
            // @ts-expect-error // TODO get rid of "ts-expect-error" thing
            const matcher = mapKeys(matchers, (key) => resolvePrefixedType(key))[value.type] ?? matchers.default; // eslint-disable-line @typescript-eslint/no-unsafe-member-access, max-len
            if (typeof matcher !== "function") {
                // @ts-expect-error // TODO get rid of "ts-expect-error" thing
                throw new Error(`Failed to resolve matching handler for the "${String(value.type)}" action`);
            }
            const args = (
                // @ts-expect-error // TODO get rid of "ts-expect-error" thing
                "payload" in value
                    ? [value.payload]
                    : []
            );
            return matcher(
                // @ts-expect-error // TODO get rid of "ts-expect-error" thing
                ...args,
            );
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        is: ((value: UnionOf<ActionsRecord>) => prefixedTypes.has(value.type)) as any // TODO get rid of any
    };
};
