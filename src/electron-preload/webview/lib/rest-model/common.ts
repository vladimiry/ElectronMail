export type Id = string; // eslint-disable-line sonarjs/redundant-type-aliases

export interface QueryParams {
    Page?: number;
    PageSize?: number;
    Sort?: "Time"; // string
    Desc?: number;
    Limit?: number;
    Location?: string;
    EndID?: string;
    End?: number;
}
