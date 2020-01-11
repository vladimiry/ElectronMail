import {buildBaseWebConfig} from "./lib";

const config = buildBaseWebConfig(
    {},
    {
        chunkName: "search-in-page-browser-view",
        typescriptLoader: true,
    },
);

export default config;
