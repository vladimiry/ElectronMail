import "./build-env-based/production";

// tslint:disable-next-line:no-eval
(window as any).electronRequire = eval("require");

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
