import {Action} from "@ngrx/store";

import {WebAccount} from "_shared/model/account";

export class PageLoadingStart implements Action {
    static readonly type = "account:page-loading-start";
    readonly type = PageLoadingStart.type;

    constructor(public account: WebAccount,
                public webView: any, /* TODO switch to Electron.WebviewTag */
                public unSubscribeOn: Promise<any>) {}
}
