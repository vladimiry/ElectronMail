export type Id = string;

export type NumberBoolean = 0 | 1;

export interface QueryParams {
    Page?: number;
    PageSize?: number;
    Sort?: string;
    Desc?: boolean;
}
