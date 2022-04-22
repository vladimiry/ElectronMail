import _logger from "electron-log";
import {powerMonitor} from "electron";

import {Config} from "src/shared/model/options";
import {curryFunctionMembers} from "src/shared/util";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/const";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main-process/actions";
import {ONE_SECOND_MS} from "src/shared/constants";

const logger = curryFunctionMembers(_logger, __filename);

const idleCheckInterval = ONE_SECOND_MS * 10;

const state: {
    clearIntervalId?: ReturnType<typeof setInterval>;
    idle?: boolean;
} = {};

export function clearIdleTimeLogOut(): void {
    if (typeof state.clearIntervalId === "undefined") {
        return;
    }

    clearInterval(state.clearIntervalId);
    delete state.clearIntervalId;
}

export async function setupIdleTimeLogOut({idleTimeLogOutSec}: Readonly<Pick<Config, "idleTimeLogOutSec">>): Promise<void> {
    clearIdleTimeLogOut();

    if (idleTimeLogOutSec < 1) {
        return;
    }

    delete state.idle;

    state.clearIntervalId = setInterval(
        async () => {
            const systemIdleTime = powerMonitor.getSystemIdleTime();
            const idle = systemIdleTime >= idleTimeLogOutSec;

            logger.debug(JSON.stringify({systemIdleTime, idleTimeLogOutSec, idle}));

            if (!idle) {
                delete state.idle;
                return;
            }

            if (state.idle) {
                return;
            }

            IPC_MAIN_API_NOTIFICATION$.next(
                IPC_MAIN_API_NOTIFICATION_ACTIONS.LogOut(),
            );

            state.idle = idle;
        },
        idleCheckInterval,
    );
}

export function setUpPowerMonitorNotification(): void {
    const notify = (...[{message}]: Parameters<typeof IPC_MAIN_API_NOTIFICATION_ACTIONS.PowerMonitor>): void => {
        IPC_MAIN_API_NOTIFICATION$.next(
            IPC_MAIN_API_NOTIFICATION_ACTIONS.PowerMonitor({message}),
        );
    };
    powerMonitor.on("suspend", () => notify({message: "suspend"}));
    powerMonitor.on("resume", () => notify({message: "resume"}));
    powerMonitor.on("shutdown", () => notify({message: "shutdown"}));
}
