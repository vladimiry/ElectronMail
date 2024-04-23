import {buildBaseWebConfig} from "./lib";

const config = buildBaseWebConfig({}, {chunkName: "about", typescriptLoader: true});

export default config;
