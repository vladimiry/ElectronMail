import {ipcRenderer} from "electron";
import {fromError} from "stacktrace-js";
import {Observable} from "rxjs/Observable";
import {Subscription} from "rxjs/Subscription";
import {catchError} from "rxjs/operators";
import * as logger from "electron-log";

import {ElectronTransport} from "_shared/model/electron";
import {ElectronIpcRendererActionType} from "_shared/electron-actions/model";
import {ElectronTransportEvent} from "../../model";

// TODO consider merging common stuff with util of the main process

// @formatter:off
export const ipcRendererOn = <T extends ElectronIpcRendererActionType> (
    channel: T["c"],
    callback: (args: { payload: T["i"] }) => Promise<T["o"]>,
) => {
    type SendType = ElectronTransport<T["o"]>;

    ipcRenderer.on(channel, (event: ElectronTransportEvent<T["o"]>, transport: ElectronTransport<T["i"]>) => {
        const payload = Object.freeze<T["i"]>(transport.payload);

        callback({payload})
            .then((result) => {
                ipcRenderer.sendToHost(
                    channel,
                    {id: transport.id, payload: result || null} as SendType,
                );
            })
            .catch((error: Error) => {
                fromError(error).then((stackFrames) => {
                    ipcRenderer.sendToHost(
                        channel,
                        {
                            id: transport.id,
                            error: {
                                message: error.message,
                                stackFrames,
                            },
                        } as SendType,
                    );
                });

                logger.error(error);

                throw error;
            });
    });
};

export const ipcRendererObservable = <T extends ElectronIpcRendererActionType> (
    channel: T["c"],
    callback: (args: { payload: T["i"] }) => Observable<T["o"]>,
) => {
    type SendType = ElectronTransport<T["o"]>;
    const subscriptions: Record<string, Subscription> = {};

    ipcRenderer.on(channel, (event: ElectronTransportEvent<T["o"]>, transport: ElectronTransport<T["i"]>) => {
        const payload = Object.freeze<T["i"]>(transport.payload);
        const observable = callback({payload});
        const offEventName = `${channel}:off:${transport.id}`;

        ipcRenderer.once(offEventName, () => {
            subscriptions[offEventName].unsubscribe();
        });

        subscriptions[offEventName] = observable
            .pipe(catchError((error: Error) => {
                fromError(error).then((stackFrames) => {
                    ipcRenderer.sendToHost(
                        channel,
                        {
                            id: transport.id,
                            error: {
                                message: error.message,
                                stackFrames,
                            },
                        } as SendType,
                    );
                });

                logger.error(error);

                throw error;
            }))
            .subscribe((result) => {
                ipcRenderer.sendToHost(
                    channel,
                    {id: transport.id, payload: result || null} as SendType,
                );
            });
    });
};

export const waitElements = <E extends HTMLElement, T extends { [k: string]: () => E }> (
    queries: T,
    opts: {timeoutMs: number} = {timeoutMs: 1000 * 10},
): Promise<T> => new Promise((resolve, reject) => {
    const startTime = Number(new Date());
    const keys = Object.keys(queries) as [keyof T];
    const result = {} as T;
    const iteration = () => {
        keys.reduce((store, key) => {
            if (!(key in store)) {
                const el = queries[key]();

                if (el) {
                    store[key] = () => el;
                }
            }

            return store;
        }, result);

        if (Object.keys(result).length === keys.length) {
            return resolve(result);
        }

        if (Number(new Date()) - startTime > opts.timeoutMs) {
            return reject(new Error(
                `Failed to locate some DOM elements: [${Object.keys(queries).join(", ")}] within ${opts.timeoutMs}ms`,
            ));
        }

        // TODO try window.requestAnimationFrame(testIteration)
        setTimeout(iteration, Math.max(100, opts.timeoutMs / 100));
    };

    iteration();
});
// @formatter:on
