import {ipcRenderer} from "electron";

import * as Api from "src/shared/api/webview/primary-login";
import {curryFunctionMembers} from "src/shared/util";
import {fillInputValue, getLocationHref, resolveDomElements} from "src/shared/util/web";
import {IPC_WEBVIEW_API_CHANNELS_MAP} from "src/shared/api/webview/const";
import {ONE_SECOND_MS} from "src/shared/const";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/lib/const";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.primary, __filename);

export function registerApi(): void {
    const endpoints: Api.ProtonPrimaryLoginApi = {
        async fillLogin({accountIndex, login}) {
            const logger = curryFunctionMembers(_logger, nameof(endpoints.fillLogin), accountIndex);

            logger.info();

            const elements = await resolveDomElements({
                username: () => document.querySelector<HTMLInputElement>("form[name=loginForm] #username"),
            }, {timeLimitMs: ONE_SECOND_MS * 10, scanIntervalMs: ONE_SECOND_MS / 4});
            logger.verbose(`elements resolved`);

            fillInputValue(elements.username, login);
            logger.verbose(`input values filled`);

            elements.username.readOnly = true;
        },
    };

    Api.PROTON_PRIMARY_LOGIN_IPC_WEBVIEW_API.register(endpoints, {logger: _logger});
    ipcRenderer.sendToHost(IPC_WEBVIEW_API_CHANNELS_MAP["primary-login"].registered);

    _logger.verbose(`api registered, url: ${getLocationHref()}`);
}
