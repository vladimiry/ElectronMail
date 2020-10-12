// TODO drop eslint disabling
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

import fsExtra from "fs-extra";
import path from "path";
import rewiremock from "rewiremock";
import sinon from "sinon";
import test from "ava";
import {Fs} from "fs-json-store";

import {PACKAGE_NAME, PACKAGE_VERSION} from "src/shared/constants";
import {generateElectronMainTestPrefixedFile} from "src/electron-main/__test__/util";

const ctxDbProps = [
    "db",
    "sessionDb",
] as const;

ctxDbProps.forEach((ctxDbProp) => {
    test.serial(
        `"Context.${ctxDbProp}" resolves encryption key calling "Context.settingsStore.readExisting().databaseEncryptionKey"`,
        async (t) => {
            const storeFs = Fs.Fs.volume();
            const storeFsBasePath = path.dirname(generateElectronMainTestPrefixedFile("some"));
            const sharedVendorCssFile = path.join(storeFsBasePath, "./web/browser-window/shared-vendor.css");
            fsExtra.ensureDirSync(path.dirname(sharedVendorCssFile));
            fsExtra.writeFileSync(sharedVendorCssFile, "");

            const {initContext} = await rewiremock.around(
                async () => import("src/electron-main/context"),
                (mock) => {
                    mock(async () => import("electron")).with(
                        {
                            app: {
                                getPath: sinon.stub().returns(storeFsBasePath),
                                getName: (): string => PACKAGE_NAME,
                                getVersion: (): string => PACKAGE_VERSION,
                            },
                        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    );
                    mock(async () => import("src/electron-main/constants")).callThrough();
                },
            );
            const ctx = initContext({
                storeFs,
                paths: {
                    appDir: storeFsBasePath,
                    userDataDir: storeFsBasePath,
                },
            });

            await t.throwsAsync(
                ctx[ctxDbProp].options.encryption.keyResolver(),
                {message: new RegExp(`${path.basename(ctx.settingsStore.file)} does not exist`)},
            );

            const {databaseEncryptionKey} = await ctx.settingsStore.write(ctx.initialStores.settings);

            const readExistingSpy = sinon.spy(ctx.settingsStore, "readExisting");
            const resolvedDbKey1 = await ctx[ctxDbProp].options.encryption.keyResolver();
            const resolvedDbKey2 = await ctx[ctxDbProp].options.encryption.keyResolver();

            t.is(2, readExistingSpy.callCount);
            t.is(databaseEncryptionKey, resolvedDbKey1);
            t.is(databaseEncryptionKey, resolvedDbKey2);
        },
    );

    test.serial(
        [
            `${ctxDbProp}.options.encryption.keyResolver()`,
            "initialSettings.databaseEncryptionKey",
            "settingsStore.databaseEncryptionKey",
        ].join(" == "),
        async (t) => {
            const storeFs = Fs.Fs.volume();
            const storeFsBasePath = path.dirname(generateElectronMainTestPrefixedFile("some"));
            const sharedVendorCssFile = path.join(storeFsBasePath, "./web/browser-window/shared-vendor.css");
            fsExtra.ensureDirSync(path.dirname(sharedVendorCssFile));
            fsExtra.writeFileSync(sharedVendorCssFile, "");

            const {INITIAL_STORES} = await import("src/electron-main/constants");
            const initialSettings = INITIAL_STORES.settings();
            const settingsStub = sinon.stub().returns(initialSettings);
            const {initContext} = await rewiremock.around(
                async () => import("src/electron-main/context"),
                (mock) => {
                    mock(async () => import("electron")).with(
                        {
                            app: {
                                getPath: sinon.stub().returns(storeFsBasePath),
                                getName: (): string => PACKAGE_NAME,
                                getVersion: (): string => PACKAGE_VERSION,
                            },
                        } as any // eslint-disable-line @typescript-eslint/no-explicit-any
                    );
                    mock(async () => import("src/electron-main/constants")).callThrough().with({
                        INITIAL_STORES: {
                            config: INITIAL_STORES.config,
                            settings: settingsStub,
                        },
                    });
                },
            );

            const ctx = initContext({
                storeFs,
                paths: {
                    appDir: storeFsBasePath,
                    userDataDir: storeFsBasePath,
                },
            });

            t.true(settingsStub.called, `"initContext()" should call "INITIAL_STORES.settings()" internally`);

            const {initApi} = await rewiremock.around(
                async () => import("src/electron-main/api"),
                (mock) => {
                    mock(async () => import("electron")).with(
                        {
                            app: {
                                on: sinon.stub()
                                    .callsArg(1)
                                    .withArgs("ready")
                                    .callsArgWith(1, {}, {on: sinon.spy()}),
                                getName: (): string => PACKAGE_NAME,
                                getVersion: (): string => PACKAGE_VERSION,
                            },
                        } as any // eslint-disable-line @typescript-eslint/no-explicit-any
                    );
                    mock(async () => import("src/electron-main/api/endpoints-builders")).callThrough().with({
                        TrayIcon: {buildEndpoints: sinon.stub()},
                    });
                    mock(async () => import("src/shared/api/main")).callThrough().with(
                        {
                            IPC_MAIN_API: {register: sinon.stub()} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                        },
                    );
                    mock(async () => import("src/electron-main/window/full-text-search")).callThrough().with({
                        attachFullTextIndexWindow: sinon.stub().returns(Promise.resolve()),
                        detachFullTextIndexWindow: sinon.stub().returns(Promise.resolve()),
                    });
                },
            );
            const {readSettings, readConfig} = await initApi(ctx);
            await readConfig();
            const {databaseEncryptionKey} = await readSettings({password: "password-123"});
            t.is(await ctx[ctxDbProp].options.encryption.keyResolver(), initialSettings.databaseEncryptionKey);
            t.is(await ctx[ctxDbProp].options.encryption.keyResolver(), databaseEncryptionKey);
        },
    );
});
