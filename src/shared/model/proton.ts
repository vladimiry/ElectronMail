export type ProtonClientSession = NoExtraProperties<{
    // TODO TS: replace "any" with serializable/stringifyable JSONValue type
    readonly windowName: Readonly<Record<string, any>>;
    // TODO TS: replace "any" with serializable/stringifyable JSONValue type
    readonly sessionStorage: Readonly<Record<string, any>>;
}>;
