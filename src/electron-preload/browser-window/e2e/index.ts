import electron from "electron"; // tslint:disable-line:no-import-zones

import "src/electron-preload/browser-window/production";

(window as any).electronRequire = ( // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    name: string,
): any => { // eslint-disable-line @typescript-eslint/no-explicit-any
    return name === "electron" // eslint-disable-line @typescript-eslint/no-unsafe-return
        ? electron
        : electron.remote.require(name);
};

document.addEventListener("DOMContentLoaded", () => {
    const content = JSON.stringify({
        title: document.title,
        userAgent: window.navigator.userAgent,
    });
    const stubElement = Object.assign(
        document.createElement("div"),
        {
            className: "e2e-stub-element",
            innerText: content,
        },
    );

    Object.assign(
        stubElement.style,
        {
            position: "fixed",
            top: "0",
            left: "0",
            color: "red",
        },
    );

    document.body.appendChild(stubElement);
});
