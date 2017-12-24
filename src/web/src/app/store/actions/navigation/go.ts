import {NavigationExtras} from "@angular/router";
import {Action} from "@ngrx/store";

export class Go implements Action {
    static type = "navigation:go";
    readonly type = Go.type;

    constructor(public payload: {
        path: any[];
        queryParams?: object;
        extras?: NavigationExtras;
    }) {}
}
