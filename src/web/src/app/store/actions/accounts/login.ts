import {Action} from "@ngrx/store";

import {WebAccount, WebAccountPageType} from "_@shared/model/account";

export class Login implements Action {
    static readonly type = "account:login";
    readonly type = Login.type;

    constructor(public pageType: WebAccountPageType,
                public webView: any /* TODO switch to Electron.WebviewTag */,
                public account: WebAccount,
                public password: string) {}
}
