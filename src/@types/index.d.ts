// <reference path="globals.d.ts" />

declare module "src/electron-preload/lib/hovered-href-highlighter/index.scss" {
    type Array2 = readonly [[path: string, value: string, extra: string]];
    const default_: Array2 & {locals: Record<"renderVisibleClass", string>};
    export default default_;
}
