import electronLog from "electron-log";
import {webContents as ElectronWebContents} from "electron";
import {Subject, from, of} from "rxjs";
import {startWith} from "rxjs/operators";

import {Context} from "src/electron-main/model";
import {Endpoints} from "src/shared/api/main";
import {Unpacked} from "src/shared/types";
import {curryFunctionMembers} from "src/shared/util";
import {initFindInPageBrowserView} from "src/electron-main/window";

type ApiMethods =
    | "findInPageDisplay"
    | "findInPage"
    | "findInPageStop"
    | "findInPageNotification";

type Notification = Unpacked<ReturnType<Endpoints["findInPageNotification"]>>;

interface NotificationMapValue {
    readonly subject: Subject<Notification>;
    readonly reset: () => void;
}

const _logger = curryFunctionMembers(electronLog, "[electron-main/api/endpoints-builders/find-in-page]");

export async function buildEndpoints(
    ctx: Context,
    resolveEndpoints: () => Endpoints,
): Promise<Pick<Endpoints, ApiMethods>> {
    let findInPageNotification: NotificationMapValue | null = null;
    const resolveContext = () => {
        if (!ctx.uiContext) {
            throw new Error(`UI Context has not been initialized`);
        }
        return ctx.uiContext;
    };
    const endpoints: Pick<Endpoints, ApiMethods> = {
        findInPageDisplay: ({visible}) => from((async (logger = curryFunctionMembers(_logger, "findInPageDisplay()")) => {
            logger.info();

            if (visible) {
                if (!ctx.selectedAccount) {
                    logger.warn(`skipping as "ctx.selectedAccount" undefined`);
                    return null;
                }

                if (ctx.selectedAccount.databaseView) {
                    // TODO figure how to hide webview from search while in database view mode
                    //      webview can't be detached from DOM as it gets reloaded when reattached
                    //      search is not available in database view mode until then
                    logger.warn(`skipping as "ctx.selectedAccount.databaseView" positive value`);
                    return null;
                }

                const {findInPage} = await resolveEndpoints().readConfig().toPromise();

                if (!findInPage) {
                    logger.debug(`skipping as "findInPage" config option disabled`);
                    return null;
                }
            }

            const uiContext = resolveContext();
            const {browserWindow} = uiContext;

            if (visible) {
                if (!uiContext.findInPageBrowserView || uiContext.findInPageBrowserView.isDestroyed()) {
                    logger.verbose(`building new "uiContext.findInPageBrowserView" instance`);
                    const view = uiContext.findInPageBrowserView = initFindInPageBrowserView(ctx);
                    setTimeout(() => view.webContents.focus());
                } else {
                    logger.debug(`skipping building new "uiContext.findInPageBrowserView" instance as existing one is still alive`);
                }
            } else {
                // reset/complete the notification
                if (findInPageNotification) {
                    logger.verbose(`destroying "findInPageNotification"`);
                    findInPageNotification.reset();
                    findInPageNotification = null;
                }

                // WARN: "findInPageBrowserView.webContents" is needed to send API response
                // so we don't destroy it immediately but with timeout letting API respond to request first
                setTimeout(() => {
                    if (!uiContext.findInPageBrowserView) {
                        logger.debug(`skipping destroying as "uiContext.findInPageBrowserView" undefined`);
                        return;
                    }

                    // destroy
                    logger.verbose(`destroying "uiContext.findInPageBrowserView"`);
                    // WARN "setBrowserView" needs to be called with null, see https://github.com/electron/electron/issues/13581
                    // TODO TS: get rid of any cast, see https://github.com/electron/electron/issues/13581
                    browserWindow.setBrowserView(null as any);
                    uiContext.findInPageBrowserView.destroy();
                    delete uiContext.findInPageBrowserView;
                });

                if (uiContext.findInPageBrowserView) {
                    browserWindow.webContents.focus();
                }
            }

            return null;
        })()),

        findInPage({query, options}) {
            if (!ctx.selectedAccount) {
                return of(null);
            }

            const webContents = ElectronWebContents.fromId(ctx.selectedAccount.webContentId);
            const requestId = webContents.findInPage(query, options);

            return of({requestId});
        },

        findInPageStop() {
            ElectronWebContents
                .getAllWebContents()
                .forEach((webContents) => webContents.stopFindInPage("clearSelection"));

            return of(null);
        },

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
            const notificationReset = (() => {
                const eventArgs: ["found-in-page", (event: Electron.Event, result: Electron.FoundInPageResult) => void] = [
                    "found-in-page",
                    (...args) => {
                        const [, result] = args;
                        if (!webContents.isDestroyed()) {
                            notificationSubject.next(result);
                        }
                    },
                ];

                webContents.addListener(...eventArgs);

                return () => {
                    if (webContents.isDestroyed()) {
                        return;
                    }
                    notificationSubject.complete();
                    webContents.removeListener(...eventArgs);
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
