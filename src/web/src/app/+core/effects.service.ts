import {Observable, of} from "rxjs";
import {Injectable} from "@angular/core";
import {Action} from "@ngrx/store";

import {CORE_ACTIONS} from "_@web/src/app/store/actions";

@Injectable()
export class EffectsService {
    buildFailActionObservable(response: Error | Action | any): Observable<ReturnType<typeof CORE_ACTIONS.Fail>> {
        if (response instanceof Error) {
            return of(CORE_ACTIONS.Fail(response));
        }

        // TODO scan "response" for error instance
        return of(CORE_ACTIONS.Fail(new Error(JSON.stringify(response))));
    }
}
