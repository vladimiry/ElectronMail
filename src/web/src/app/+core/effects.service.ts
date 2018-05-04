import {of, Observable} from "rxjs";
import {Injectable} from "@angular/core";
import {Action} from "@ngrx/store";

import {CoreActions} from "_web_app/store/actions";

@Injectable()
export class EffectsService {
    buildFailActionObservable(response: Error | Action | any): Observable<CoreActions.Fail> {
        if (response instanceof Error) {
            return of(new CoreActions.Fail(response));
        }

        // TODO scan "response" for error instance
        return of(new CoreActions.Fail(new Error(JSON.stringify(response))));
    }
}
