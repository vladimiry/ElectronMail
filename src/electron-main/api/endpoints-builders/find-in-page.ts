import electronLog from "electron-log";
import {webContents as ElectronWebContents} from "electron";
import {Subject, of} from "rxjs";
import {startWith} from "rxjs/operators";

import {Context} from "src/electron-main/model";
import {IpcMainApiEndpoints, IpcMainServiceScan} from "src/shared/api/main";
import {curryFunctionMembers} from "src/shared/util";
import {initFindInPageBrowserView} from "src/electron-main/window/find-in-page";

type ApiMethods = keyof Pick<IpcMainApiEndpoints,
    | "findInPageDisplay"
    | "findInPage"
    | "findInPageStop"
    | "findInPageNotification">;

type Notification = IpcMainServiceScan["ApiImplReturns"]["findInPageNotification"];

interface NotificationMapValue {
    readonly subject: Subject<Notification>;
    readonly reset: () => void;
}

const _logger = curryFunctionMembers(electronLog, __filename);

export async function buildEndpoints(ctx: Context): Promise<Pick<IpcMainApiEndpoints, ApiMethods>> {
    let findInPageNotification: NotificationMapValue | null = null;

    const resolveContext = (): Exclude<typeof ctx.uiContext, undefined> => {
        if (!ctx.uiContext) {
            throw new Error(`"${nameof.full(ctx.uiContext)}" has not been initialized`);
        }
        return ctx.uiContext;
    };

    const endpoints: Pick<IpcMainApiEndpoints, ApiMethods> = {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async findInPageDisplay({visible}) {
            const logger = curryFunctionMembers(_logger, nameof(endpoints.findInPageDisplay));

            logger.info();

            if (visible) {
                if (!ctx.selectedAccount) {
                    logger.warn(`skipping as "${nameof.full(ctx.selectedAccount)}" undefined`);
                    return;
                }

                if (ctx.selectedAccount.databaseView) {
                    // TODO figure how to hide webview from search while in database view mode
                    //      webview can't be detached from DOM as it gets reloaded when reattached
                    //      search is not available in database view mode until then
                    logger.warn(`skipping as "${nameof.full(ctx.selectedAccount.databaseView)}" positive value`);
                    return;
                }

                const {findInPage} = await (await ctx.deferredEndpoints.promise).readConfig();

                if (!findInPage) {
                    logger.debug(`skipping as "${nameof(findInPage)}" config option disabled`);
                    return;
                }
            }

            const uiContext = resolveContext();
            const {browserWindow} = uiContext;

            if (visible) {
                const {findInPageBrowserView: existingView} = uiContext;
                if (
                    !existingView
                    ||
                    (
                        existingView.isDestroyed
                        &&
                        existingView.isDestroyed()
                    )
                ) {
                    logger.verbose(`building new "${nameof.full(uiContext.findInPageBrowserView)}" instance`);
                    setTimeout(
                        async () => (uiContext.findInPageBrowserView = await initFindInPageBrowserView(ctx)).webContents.focus(),
                    );
                } else {
                    logger.verbose(`focusing existing "${nameof.full(uiContext.findInPageBrowserView)}" instance`);
                    existingView.webContents.focus();
                }
            } else {
                // reset/complete the notification
                if (findInPageNotification) {
                    logger.verbose(`destroying "${nameof(findInPageNotification)}"`);
                    findInPageNotification.reset();
                    findInPageNotification = null;
                }

                // WARN: "findInPageBrowserView.webContents" is needed to send API response
                // so we don't destroy it immediately but with timeout letting API respond to request first
                setTimeout(() => {
                    if (!uiContext.findInPageBrowserView) {
                        logger.debug(`skipping destroying as "${nameof.full(uiContext.findInPageBrowserView)}" undefined`);
                        return;
                    }

                    // destroy
                    logger.verbose(`destroying "${nameof.full(uiContext.findInPageBrowserView)}"`);
                    // WARN "setBrowserView" needs to be called with null, see https://github.com/electron/electron/issues/13581
                    browserWindow.setBrowserView(
                        // TODO TS: get rid of any cast, see https://github.com/electron/electron/issues/13581
                        null as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    );
                    {
                        const {destroy} = uiContext.findInPageBrowserView;
                        destroy && destroy(); // eslint-disable-line no-unused-expressions
                    }
                    delete uiContext.findInPageBrowserView;
                });

                if (uiContext.findInPageBrowserView) {
                    browserWindow.webContents.focus();
                }
            }
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async findInPage({query, options}) {
            if (!ctx.selectedAccount) {
                return null;
            }

            const webContents = ElectronWebContents.fromId(ctx.selectedAccount.webContentId);
            const requestId = webContents.findInPage(query, options);

            return {requestId};
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async findInPageStop() {
            ElectronWebContents
                .getAllWebContents()
                .forEach((webContents) => webContents.stopFindInPage("clearSelection"));
        },

        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        findInPageNotification() {
            if (findInPageNotification) {
                findInPageNotification.reset();
                findInPageNotification = null;
            }

            if (!ctx.selectedAccount) {
                return of({requestId: null});
            }

            const webContents = ElectronWebContents.fromId(ctx.selectedAccount.webContentId);
            const notificationSubject = new Subject<Notification>();
            const notificationReset = ((): () => void => {
                const eventSubscriptionArgs: ["found-in-page", (event: Electron.Event, result: Electron.FoundInPageResult) => void] = [
                    "found-in-page",
                    (...args): void => {
                        const [, result] = args;
                        if (!webContents.isDestroyed()) {
                            notificationSubject.next(result);
                        }
                    },
                ];

                webContents.addListener(...eventSubscriptionArgs);

                return (): void => {
                    if (webContents.isDestroyed()) {
                        return;
                    }
                    notificationSubject.complete();
                    webContents.removeListener(...eventSubscriptionArgs);
                };
            })();

            findInPageNotification = {subject: notificationSubject, reset: notificationReset};

            return notificationSubject.asObservable().pipe(
                // initial/fake response resets the timeout
                startWith({requestId: null}),
            );
        },
    };

    return endpoints;
}
