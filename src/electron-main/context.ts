// TODO drop eslint disabling
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

import asap from "asap-es";
import logger from "electron-log";
import path from "path";
import {Deferred} from "ts-deferred";
import {ReplaySubject, merge} from "rxjs";
import {Fs as StoreFs, Model as StoreModel, Store} from "fs-json-store";
import {app} from "electron";
import {distinctUntilChanged, take} from "rxjs/operators";

import {BINARY_NAME, LOCAL_WEBCLIENT_PROTOCOL_PREFIX, RUNTIME_ENV_USER_DATA_DIR, WEB_PROTOCOL_SCHEME} from "src/shared/constants";
import {Config, Settings} from "src/shared/model/options";
import {Context, ContextInitOptions, ContextInitOptionsPaths, ProperLockfileError} from "./model";
import {Database} from "./database";
import {ElectronContextLocations} from "src/shared/model/electron";
import {INITIAL_STORES, configEncryptionPresetValidator, settingsAccountLoginUniquenessValidator} from "./constants";
import {SessionStorage} from "src/electron-main/session-storage";
import {WEBPACK_WEB_CHUNK_NAMES} from "src/shared/webpack-conts";
import {formatFileUrl} from "./util";

function exists(file: string, storeFs: StoreModel.StoreFs): boolean {
    try {
        storeFs._impl.statSync(file);
    } catch (error) {
        if (error.code === "ENOENT") {
            return false;
        }

        throw error;
    }

    return true;
}

function directoryExists(file: string, storeFs: StoreModel.StoreFs = StoreFs.Fs.fs): boolean {
    if (!(exists(file, storeFs))) {
        return false;
    }

    const stat: ReturnType<typeof import("fs")["statSync"]> = storeFs._impl.statSync(file);

    return Boolean(stat?.isDirectory());
}

function listDirsNames(storeFs: StoreModel.StoreFs, dir: string): string[] {
    const result: string[] = [];
    if (!(exists(dir, storeFs))) {
        return result;
    }
    const files: string[] = storeFs._impl.readdirSync(dir);
    for (const dirName of files) {
        const dirPath = path.join(dir, dirName);
        if (directoryExists(dirPath, storeFs)) {
            result.push(dirName);
        }
    }
    return result;
}

function initLocations(
    storeFs: StoreModel.StoreFs,
    paths?: ContextInitOptionsPaths,
): NoExtraProps<ElectronContextLocations> {
    const {appDir, userDataDir}: ContextInitOptionsPaths = (
        paths
        ??
        {
            appDir: path.resolve(
                __dirname,
                BUILD_ENVIRONMENT === "development"
                    ? "../app-dev"
                    : "../app",
            ),
            userDataDir: path.resolve(
                (() => {
                    const envVarName = RUNTIME_ENV_USER_DATA_DIR;
                    const envVarValue = process.env[envVarName];
                    if (envVarValue && !directoryExists(envVarValue, storeFs)) {
                        throw new Error(
                            `Make sure that the directory exists before passing the "${envVarName}" environment variable`,
                        );
                    }
                    return envVarValue;
                })()
                ||
                app.getPath("userData")
            ),
        }
    );

    logger.transports.file.file = path.join(userDataDir, "log.log");
    logger.transports.file.maxSize = 1024 * 1024 * 50; // 50MB
    logger.transports.file.level = INITIAL_STORES.config().logLevel;
    logger.transports.console.level = false;

    if (BUILD_ENVIRONMENT !== "e2e") { // eslint-disable-line sonarjs/no-collapsible-if
        // TODO electron fix: the "Dictionaries" dir still stays as default place
        //      see https://github.com/electron/electron/issues/26039
        if (path.resolve(userDataDir) !== path.resolve(app.getPath("userData"))) {
            // TODO figure why "app.setPath(...)" call breaks normal e2e/spectron test start
            app.setPath("userData", userDataDir);
            app.setAppLogsPath(
                path.join(userDataDir, BINARY_NAME, "logs"),
            );
        }
    }

    const appRelativePath = (...value: string[]): string => path.join(appDir, ...value);
    const icon = appRelativePath("./assets/icons/icon.png");

    return {
        appDir,
        userDataDir,
        icon,
        trayIcon: icon,
        trayIconFont: appRelativePath("./assets/fonts/tray-icon/roboto-derivative.ttf"),
        browserWindowPage: formatFileUrl(
            appRelativePath("./web/", WEBPACK_WEB_CHUNK_NAMES["browser-window"], "index.html"),
        ),
        aboutBrowserWindowPage: appRelativePath("./web/", WEBPACK_WEB_CHUNK_NAMES.about, "index.html"),
        searchInPageBrowserViewPage: appRelativePath("./web/", WEBPACK_WEB_CHUNK_NAMES["search-in-page-browser-view"], "index.html"),
        preload: {
            aboutBrowserWindow: appRelativePath("./electron-preload/about.js"),
            browserWindow: appRelativePath("./electron-preload/browser-window.js"),
            browserWindowE2E: appRelativePath("./electron-preload/browser-window-e2e.js"),
            searchInPageBrowserView: appRelativePath("./electron-preload/search-in-page-browser-view.js"),
            fullTextSearchBrowserWindow: appRelativePath("./electron-preload/database-indexer.js"),
            primary: formatFileUrl(appRelativePath("./electron-preload/webview/primary.js")),
            calendar: formatFileUrl(appRelativePath("./electron-preload/webview/calendar.js")),
        },
        // TODO electron: get rid of "baseURLForDataURL" workaround, see https://github.com/electron/electron/issues/20700
        vendorsAppCssLinkHrefs: ["shared-vendor-dark", "shared-vendor-light"]
            .map((value) => `${WEB_PROTOCOL_SCHEME}://browser-window/${value}.css`),
        ...((): NoExtraProps<Pick<ElectronContextLocations, "protocolBundles" | "webClients">> => {
            const {protocolBundles, webClients}:
                {
                    webClients: Array<Unpacked<ElectronContextLocations["webClients"]>>;
                    protocolBundles: Array<{ scheme: string; directory: string }>;
                } = {
                protocolBundles: [],
                webClients: [],
            };
            const webClientsDir = appRelativePath("webclient");

            let schemeIndex = 0;

            for (const dirName of listDirsNames(storeFs, webClientsDir)) {
                const directory = path.resolve(webClientsDir, dirName);
                const scheme = `${LOCAL_WEBCLIENT_PROTOCOL_PREFIX}${schemeIndex++}`;

                webClients.push({
                    entryUrl: `${scheme}://${dirName}`,
                    entryApiUrl: `https://${dirName}`,
                });
                protocolBundles.push({
                    scheme,
                    directory,
                });
            }

            return {protocolBundles, webClients};
        })(),
    };
}

function isProperLockfileError(value: unknown | ProperLockfileError): value is ProperLockfileError {
    return (
        typeof value === "object"
        &&
        typeof (value as ProperLockfileError).message === "string"
        &&
        (value as ProperLockfileError).code === "ELOCKED"
        &&
        typeof (value as ProperLockfileError).file === "string"
        &&
        Boolean(
            (value as ProperLockfileError).file,
        )
    );
}

function wrapProperLockfileError(error: ProperLockfileError): ProperLockfileError {
    const extendedMessage = [
        `. Related data file: "${error.file}".`,
        "Normally, this error indicates that the app was abnormally closed or a power loss has taken place.",
        "Please restart the app to restore its functionality (stale lock files will be removed automatically).",
    ].join(" ");
    return Object.assign(
        error,
        {message: `${error.message} ${extendedMessage}`},
    );
}

export function initContext(
    {storeFs = StoreFs.Fs.fs, ...options}: ContextInitOptions = {},
): NoExtraProps<Context> {
    const locations = initLocations(storeFs, options.paths);

    // the lock path gets resolved explicitly in case "proper-lockfile" module changes the default resolving strategy in the future
    const lockfilePathResolver = (file: string): string => `${file}.lock`;

    const {
        config$,
        configStore,
    } = ((): NoExtraProps<Pick<Context, "config$" | "configStore">> => {
        const store = new Store<Config>({
            fs: storeFs,
            optimisticLocking: true,
            lockfilePathResolver,
            file: path.join(locations.userDataDir, "config.json"),
            validators: [configEncryptionPresetValidator],
            serialize: (data): Buffer => Buffer.from(JSON.stringify(data, null, 2)),
        });
        const valueChangeSubject$ = new ReplaySubject<Config>(1);

        store.read = ((read): typeof store.read => {
            const result: typeof store.read = async (...args) => {
                const config = await read(...args);
                if (config) {
                    valueChangeSubject$.next(config);
                }
                return config;
            };
            return result;
        })(store.read.bind(store));

        store.write = ((write): typeof store.write => {
            const result: typeof store.write = async (...args) => {
                let callResult: Unpacked<ReturnType<typeof write>> | undefined;
                try {
                    callResult = await write(...args);
                } catch (error) {
                    if (isProperLockfileError((error))) {
                        throw wrapProperLockfileError(error);
                    }
                    throw error;
                }
                valueChangeSubject$.next(callResult);
                return callResult;
            };
            return result;
        })(store.write.bind(store));

        return {
            config$: merge(
                valueChangeSubject$.asObservable().pipe(
                    take(1),
                ),
                valueChangeSubject$.asObservable().pipe(
                    distinctUntilChanged(({_rev: prev}, {_rev: curr}) => curr === prev),
                ),
            ),
            configStore: store,
        };
    })();

    const ctx: Context = {
        storeFs,
        locations,
        deferredEndpoints: new Deferred(),
        ...((): NoExtraProps<Pick<Context, "db" | "sessionDb">> => {
            const encryption = {
                async keyResolver() {
                    const {databaseEncryptionKey} = await ctx.settingsStore.readExisting();
                    return databaseEncryptionKey;
                },
                async presetResolver() {
                    return {encryption: {type: "sodium.crypto_secretbox_easy", preset: "algorithm:default"}} as const;
                },
            } as const;
            return {
                db: new Database(
                    {
                        file: path.join(locations.userDataDir, "database.bin"),
                        encryption,
                    },
                    storeFs,
                ),
                sessionDb: new Database(
                    {
                        file: path.join(locations.userDataDir, "database-session.bin"),
                        encryption,
                    },
                    storeFs,
                ),
            };
        })(),
        ...((): NoExtraProps<Pick<Context, "sessionStorage">> => {
            const encryption = {
                async keyResolver() {
                    const {sessionStorageEncryptionKey} = await ctx.settingsStore.readExisting();
                    return sessionStorageEncryptionKey;
                },
                async presetResolver() {
                    return {encryption: {type: "sodium.crypto_secretbox_easy", preset: "algorithm:default"}} as const;
                },
            } as const;
            return {
                sessionStorage: new SessionStorage(
                    {
                        file: path.join(locations.userDataDir, "session.bin"),
                        encryption,
                    },
                    storeFs,
                ),
            };
        })(),
        initialStores: options.initialStores || {config: INITIAL_STORES.config(), settings: INITIAL_STORES.settings()},
        config$,
        configStore,
        configStoreQueue: new asap(),
        settingsStore: (() => {
            const store = new Store<Settings>({
                fs: storeFs,
                optimisticLocking: true,
                lockfilePathResolver,
                file: path.join(locations.userDataDir, "settings.bin"),
                validators: [settingsAccountLoginUniquenessValidator],
            });
            store.write = ((write): typeof store.write => {
                const result: typeof store.write = async (...args) => {
                    try {
                        return await write(...args);
                    } catch (error) {
                        if (isProperLockfileError((error))) {
                            throw wrapProperLockfileError(error);
                        }
                        throw error;
                    }
                };
                return result;
            })(store.write.bind(store));
            return store;
        })(),
        settingsStoreQueue: new asap(),
        keytarSupport: true,
        getSpellCheckController: () => {
            throw new Error(`Spell check controller has net been initialized yet`);
        },
    };

    // "proper-lockfile" module creates directory-based locks (since it's an atomic operation on all systems)
    // so lets remove the stale locks on app start
    // in general, a stale locks might remain on the file system due to the abnormal program exit, power loss, etc
    for (const {file, fs: {_impl: fsImpl}} of [ctx.configStore, ctx.settingsStore]) {
        const lockFile = lockfilePathResolver(file);
        if (fsImpl.existsSync(lockFile)) {
            fsImpl.rmdirSync(lockFile);
        }
    }

    return ctx;
}
