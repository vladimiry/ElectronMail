import electronLog from "electron-log";

import {Context} from "src/electron-main/model";
import {curryFunctionMembers} from "src/shared/util";
import {IpcMainApiEndpoints} from "src/shared/api/main-process";
import * as service from "./service";

const logger = curryFunctionMembers(electronLog, __filename);

export async function buildDbUnreadNotificationEndpoints(
    ctx: Context,
): Promise<Pick<IpcMainApiEndpoints, "resolveUnreadNotificationMessage" | "executeUnreadNotificationShellCommand">> {
    const endpoints: Unpacked<ReturnType<typeof buildDbUnreadNotificationEndpoints>> = {
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async resolveUnreadNotificationMessage({login, alias, code}) {
            logger.info(nameof(endpoints.resolveUnreadNotificationMessage));
            const account = ctx.db.getAccount({login});
            if (!account) {
                throw new Error(`${nameof(endpoints.resolveUnreadNotificationMessage)}: account resolving failed`);
            }
            return service.resolveUnreadNotificationMessage(account, {login, title: alias}, code);
        },
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        async executeUnreadNotificationShellCommand({login, alias, code}) {
            logger.info(nameof(endpoints.executeUnreadNotificationShellCommand));
            const account = ctx.db.getAccount({login});
            if (!account) {
                throw new Error(`${nameof(endpoints.executeUnreadNotificationShellCommand)}: account resolving failed`);
            }
            return service.executeUnreadNotificationShellCommand(account, {login, title: alias}, code);
        },
    };
    return endpoints;
}
