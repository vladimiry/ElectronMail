import "src/web/search-in-page-browser-view/index.scss";
import {SearchInPageWidget} from "./widget";
import {registerNativeThemeReaction} from "src/web/lib/native-theme";

registerNativeThemeReaction(__ELECTRON_EXPOSURE__);

document.addEventListener("DOMContentLoaded", () => {
    const root = document.querySelector(".input-group") as HTMLElement;
    const input = root.querySelector("input") as HTMLInputElement;
    const status = root.querySelector(".input-group-text") as HTMLElement;
    const findPrev = root.querySelector(".input-group-append button:nth-of-type(1)") as HTMLButtonElement;
    const findNext = root.querySelector(".input-group-append button:nth-of-type(2)") as HTMLButtonElement;
    const close = root.querySelector(".input-group-append button:nth-of-type(3)") as HTMLButtonElement;

    new SearchInPageWidget({
        els: {
            root,
            input,
            status,
            findPrev,
            findNext,
            close,
        },
    }).open();
});
