// <reference path="globals.d.ts" />

declare module "src/electron-preload/lib/hovered-href-highlighter/index.scss" {
    type Array2 = readonly [[path: string, value: string, extra: string]];
    const default_: Array2 & {locals: Record<"renderVisibleClass", string>};
    export default default_;
}

declare module "@ngrx/store/src/action_creator" {
    export const props2: typeof import("@ngrx/store").props;
    export {props2 as props};
}

// TODO load minimal monaco+typescript only, not the entire library
// declare module "monaco-editor/esm/vs/editor/editor.api" {
//     export * from "monaco-editor";
// }
// declare module "monaco-editor/esm/vs/basic-languages/typescript/typescript" {
//     import type * as monaco from "monaco-editor";
//     export const language: monaco.languages.IMonarchLanguage;
//     export const conf: monaco.languages.LanguageConfiguration;
//     export const id: string;
// }
// declare module "monaco-editor/esm/vs/language/typescript/monaco.contribution" {
//     // registers side effects into monaco.languages.typescript, no exports needed
// }
