// TODO make "ngrx-util" independent from @angular and use it for all @ngrx manipulations (including "ofType" calls)
import {ActionCreator, ActionCreatorProps, createAction} from "@ngrx/store";
import {mapKeys} from "remeda";

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

export type UnionOf<T extends ActionsRecord> = Exclude<ReturnType<import("ts-essentials").ValueOf<StrictOmit<T, MatchPropName>>>, boolean>;

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

// TODO actions: freeze the result
export const propsRecordToActionsRecord = <P extends PropsRecord>(
    value: P,
    {prefix}: { prefix: string },
): ActionsRecord<P>
    & { [K in MatchPropName]: Match<P> }
    & { is: (value: UnionOf<ActionsRecord>) => value is UnionOf<ActionsRecord<P>> } => {
    const prefixedTypes = new Set<string>();
    const resolvePrefixedType = (key: keyof P): string => {
        const result = `${prefix}:${String(key)}`;
        prefixedTypes.add(result);
        return result;
    };
    return {
        ...Object.entries(value).reduce(
            (accumulator, [key, actionCreatorProps]) => ({
                ...accumulator,
                [key]: actionCreatorProps
                    ? createAction(
                        resolvePrefixedType(key),
                        (value: typeof actionCreatorProps._p) => ({payload: value}),
                    )
                    : createAction(resolvePrefixedType(key)),
            }),
            {} as ActionsRecord<P>,
        ),
        match(value, matchers) {
            const matcher = mapKeys(matchers, (key) => resolvePrefixedType(key))[value.type] ?? matchers.default;
            if (typeof matcher !== "function") {
                throw new Error(`Failed to resolve matching handler for the "${value.type}" action`);
            }
            const args = (
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
