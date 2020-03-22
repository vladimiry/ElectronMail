// TODO get back "@types/sanitize-html" module use when it fixes the following issues:
//      - node_modules/@types/domutils/index.d.ts:6:10 - error TS2614 ...
//      - node_modules/@types/htmlparser2/index.d.ts:17:10 - error TS2614 ...
//      - node_modules/@types/sanitize-html/index.d.ts:18:10 - error TS2459 ...
//      see https://github.com/apostrophecms/sanitize-html/issues/320

declare const defaultExport: {
    (dirty: string, options?: { allowedTags?: string[] | boolean }): string;
    defaults: { allowedTags: string[] };
};

declare module "sanitize-html" {
    export default defaultExport;
}
