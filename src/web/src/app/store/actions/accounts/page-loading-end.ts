import {Action} from "@ngrx/store";

import {WebAccount, WebAccountPageUrl} from "_shared/model/account";

export class PageLoadingEnd implements Action {
    static readonly type = "account:page-loading-end";
    readonly type = PageLoadingEnd.type;

    constructor(public account: WebAccount,
                public patch: {
                    webView: any, /* TODO switch to Electron.WebviewTag */
                    pageUrl: WebAccountPageUrl,
                }) {}
}
