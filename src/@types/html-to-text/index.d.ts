// import * as Upstream from "html-to-text";

// TODO drop "src/@types/html-to-text" when new "html-to-text" and "@types/html-to-text" get released
declare module "html-to-text" {
    export interface HtmlToTextOptions /* extends Upstream.HtmlToTextOptions */
    {
        limits: {
            maxChildNodes: number;
            maxDepth: number;
        },
    }

    export function fromString(str: string, options?: HtmlToTextOptions): string;
}
