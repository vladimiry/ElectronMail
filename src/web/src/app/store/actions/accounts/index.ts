import {AccountNotification} from "./account-notification";
import {ActivateAccount} from "./activate-account";
import {DestroyAccount} from "./destory-account";
import {Login} from "./login";
import {PageLoadingEnd} from "./page-loading-end";
import {PageLoadingStart} from "./page-loading-start";
import {PatchAccountProgress} from "./patch-account-progress";
import {SyncAccountsConfigs} from "./accounts-configs-sync";
import {UpdateOverlayIcon} from "./update-overlay-icon";

export {
    AccountNotification,
    ActivateAccount,
    DestroyAccount,
    Login,
    PageLoadingEnd,
    PageLoadingStart,
    PatchAccountProgress,
    SyncAccountsConfigs,
    UpdateOverlayIcon,
};

export type All =
    | AccountNotification
    | ActivateAccount
    | DestroyAccount
    | Login
    | PageLoadingEnd
    | PageLoadingStart
    | PatchAccountProgress
    | SyncAccountsConfigs
    | UpdateOverlayIcon;
