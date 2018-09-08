// tslint:disable:no-console

const originalConsole = {
    context: console,
    error: console.error,
    warn: console.warn,
    info: console.info,
    verbose: (console as any).verbose,
    debug: console.debug,
    silly: (console as any).silly,
    log: console.log,
};

const stub = (/*data*/) => {
    // console.log(">> called", data);
};
const stubConsole = {
    context: null,
    error: stub,
    warn: stub,
    info: stub,
    verbose: stub,
    debug: stub,
    silly: stub,
    log: stub,
};

const container = {};

((window as any).ELECTRON_LOG = {
    original: () => Object.assign(container, originalConsole),
    stub: () => Object.assign(container, stubConsole),
}).stub();

module.exports = container;
