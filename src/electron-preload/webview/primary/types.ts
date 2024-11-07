// TODO review the actual "error" resposne
export interface ProtonApiError {
    config?: unknown;
    data?: {Error?: unknown; ErrorDescription?: unknown; Code?: number; dataCode?: number; dataError?: string};
    dataCode?: number;
    dataError?: string;
    message: string;
    name: string;
    response?: Partial<Response>;
    status: number;
}
