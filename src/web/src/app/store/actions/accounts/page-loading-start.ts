import {Action} from "@ngrx/store";

import {WebAccount, WebAccountPageUrl} from "_shared/model/account";

export class PageLoadingStart implements Action {
    static readonly type = "account:page-loading-start";
    readonly type = PageLoadingStart.type;

    constructor(public account: WebAccount,
                public patch: {
                    webView: any, /* TODO switch to Electron.WebviewTag */
                    pageUrl: WebAccountPageUrl,
                },
                public unSubscribeOn: Promise<any>) {}
}
