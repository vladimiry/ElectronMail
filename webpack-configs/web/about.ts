import {buildBaseWebConfig} from "./lib";

const config = buildBaseWebConfig(
    {},
    {
        chunkName: "about",
        awesomeTypescriptLoader: true,
    },
);

export default config;
