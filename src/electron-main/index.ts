import {app} from "electron";

import {appReadyHandler} from "./bootstrap/app-ready";
import {bootstrapCommandLine} from "./bootstrap/command-line";
import {bootstrapInit} from "./bootstrap/init";
import {initContext} from "./context";
import {registerStandardSchemes} from "./protocol";

bootstrapInit();

// TODO consider sharing "Context" using dependency injection approach
const ctx = initContext();

bootstrapCommandLine(ctx);

registerStandardSchemes(ctx);

app.on("ready", async () => {
    await appReadyHandler(ctx);
});
