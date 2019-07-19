import {buildBaseWebConfig} from "./lib";

const config = buildBaseWebConfig(
    {},
    {
        chunkName: "search-in-page-browser-view",
        awesomeTypescriptLoader: true,
    },
);

export default config;
