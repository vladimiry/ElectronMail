import {ChangeDetectionStrategy, Component} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {filter, map} from "rxjs/operators";

import {FEATURED} from "src/web/src/app/store/selectors/options";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";
import {State} from "src/web/src/app/store/reducers/root";

@Component({
    selector: "electron-mail-hovered-href",
    templateUrl: "./hovered-href.component.html",
    styleUrls: ["./hovered-href.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HoveredHrefComponent {
    targetUrl$ = this.store.pipe(
        select(FEATURED.mainProcessNotification),
        filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.TargetUrl),
        map(({payload: {url}}) => url),
    );

    constructor(
        private store: Store<State>,
    ) {}
}
