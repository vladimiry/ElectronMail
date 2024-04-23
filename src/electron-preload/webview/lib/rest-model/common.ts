export type Id = string;

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
