export type ProtonClientSession = NoExtraProperties<{
    // TODO TS: replace "any" with serializable/stringifyable JSONValue type
    readonly windowName: Readonly<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
    // TODO TS: replace "any" with serializable/stringifyable JSONValue type
    readonly sessionStorage: Readonly<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
}>;

export type ProtonMailExternalIdProp = NoExtraProperties<{
    ExternalID: string;
}>;

export type ProtonAttachmentHeadersProp = NoExtraProperties<{
    Headers: Record<string, string>;
}>;
