import {Action} from "@ngrx/store";

import {WebAccount} from "_shared/model/account";

export class PageLoadingEnd implements Action {
    static readonly type = "account:page-loading-end";
    readonly type = PageLoadingEnd.type;

    constructor(public account: WebAccount,
                public webView: any /* TODO switch to Electron.WebviewTag */) {}
}
