import "../browser-window-production-env";

if (process.env.NODE_ENV === "e2e") {
    // tslint:disable:no-eval
    (window as any).electronRequire = eval("require");
    // tslint:enable:no-eval
}