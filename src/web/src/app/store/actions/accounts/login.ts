import {Action} from "@ngrx/store";

import {WebAccount, WebAccountPageUrl} from "_shared/model/account";

export class Login implements Action {
    static readonly type = "account:login";
    readonly type = Login.type;

    constructor(public pageUrl: WebAccountPageUrl,
                public webView: any /* TODO switch to Electron.WebviewTag */,
                public account: WebAccount,
                public password: string) {}
}
