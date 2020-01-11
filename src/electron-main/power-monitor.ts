import _logger from "electron-log";
import {powerMonitor} from "electron";

import {Config} from "src/shared/model/options";
import {IPC_MAIN_API_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {ONE_SECOND_MS} from "src/shared/constants";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(_logger, "[src/electron-main/power-monitor]");

const idleCheckInterval = ONE_SECOND_MS * 10;

const state: {
    clearIntervalId?: ReturnType<typeof setInterval>;
    idle?: boolean;
} = {};

export async function setupIdleTimeLogOut({idleTimeLogOutSec}: Readonly<Pick<Config, "idleTimeLogOutSec">>): Promise<void> {
    clearIdleTimeLogOut();

    if (idleTimeLogOutSec < 1) {
        return;
    }

    const {getIdleTime} = await import("desktop-idle");

    delete state.idle;

    state.clearIntervalId = setInterval(
        async () => {
            const idleTime = getIdleTime();
            const idle = idleTime >= idleTimeLogOutSec;

            logger.debug(JSON.stringify({idleTime, idleTimeLogOutSec, idle}));

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

export function clearIdleTimeLogOut(): void {
    if (typeof state.clearIntervalId === "undefined") {
        return;
    }

    clearInterval(state.clearIntervalId);
    delete state.clearIntervalId;
}

export function setUpPowerMonitorNotification(): void {
    const notify = (...[{message}]: Parameters<typeof IPC_MAIN_API_NOTIFICATION_ACTIONS.PowerMonitor>) => {
        IPC_MAIN_API_NOTIFICATION$.next(
            IPC_MAIN_API_NOTIFICATION_ACTIONS.PowerMonitor({message}),
        );
    };
    powerMonitor.on("suspend", () => notify({message: "suspend"}));
    powerMonitor.on("resume", () => notify({message: "resume"}));
    powerMonitor.on("shutdown", () => notify({message: "shutdown"}));
}
