export const WEBPACK_WEB_CHUNK_NAMES = {
    "about": "about",
    "browser-window": "browser-window",
    "search-in-page-browser-view": "search-in-page-browser-view",
} as const;

// WARN make sure MONACO_EDITOR_ASSETS_SUBFOLDER constant
//      matches the value used in src/web/browser-window/app/_options/account-edit.component.html
export const MONACO_EDITOR_ASSETS_SUBFOLDER = "monaco-editor";
// export const MONACO_EDITOR_LAZY_CHUNK_NAME = `${MONACO_EDITOR_ASSETS_SUBFOLDER}/editor`;

// export const MONACO_TS_LAZY_CHUNK_NAME = `${MONACO_EDITOR_ASSETS_SUBFOLDER}/language-typescript`;
// export const MONACO_TS_CONTRIB_LAZY_CHUNK_NAME = `${MONACO_EDITOR_ASSETS_SUBFOLDER}/language-typescript-contribution`;
