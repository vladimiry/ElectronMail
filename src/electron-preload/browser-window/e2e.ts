import electron from "electron"; // tslint:disable-line:no-import-zones

import "./build-env-based/production";

(window as any).electronRequire = (name: string): any => {
    return name === "electron"
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
