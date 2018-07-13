import {catchError, map, switchMap, take} from "rxjs/operators";
import {Observable, of} from "rxjs";
import {Component, EventEmitter, Input, Output} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {Store} from "@ngrx/store";

import {CORE_ACTIONS, NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";
import {ElectronService} from "../+core/electron.service";
import {KeePassClientConf, KeePassRef} from "src/shared/model/keepasshttp";
import {SETTINGS_OUTLET, SETTINGS_PATH} from "src/web/src/app/app.constants";
import {State} from "src/web/src/app/store/reducers/options";

@Component({
    selector: `email-securely-app-keepass-reference`,
    templateUrl: "./keepass-reference.component.html",
})
export class KeePassReferenceComponent {
    // form
    url = new FormControl(null, Validators.required);
    uuid = new FormControl(null, Validators.required);
    form = new FormGroup({
        url: this.url,
        uuid: this.uuid,
    });
    // keepass
    @Input()
    keePassClientConf$: Observable<KeePassClientConf>;
    @Input()
    reference$: Observable<KeePassRef>;
    // output
    @Output()
    linkHandler = new EventEmitter<KeePassRef>();
    @Output()
    unlinkHandler = new EventEmitter<void>();
    // progress
    referencing?: boolean;
    // other
    message?: string;

    constructor(private store: Store<State>,
                private electronService: ElectronService) {}

    // TODO consider moving this to the "effects" service, ie keep a component dump by interacting with the "store" only
    async submit() {
        const keePassRef = {
            url: this.url.value,
            uuid: this.uuid.value,
        };

        this.referencing = true;

        await this.keePassClientConf$
            .pipe(
                take(1),
                switchMap((keePassClientConf) => this.electronService
                    .keePassPassword(keePassClientConf, keePassRef)
                    .pipe(
                        map(({password, message}) => {
                            delete this.referencing;

                            if (password) {
                                delete this.message;
                                this.linkHandler.emit(keePassRef);
                            } else {
                                this.message = message;
                            }
                        }),
                        catchError((error) => {
                            const failAction = CORE_ACTIONS.Fail(error);
                            delete this.referencing;
                            delete this.message;
                            this.store.dispatch(failAction);
                            return of(failAction);
                        }),
                    )),
            )
            .toPromise();
    }

    unlink() {
        if (!confirm(`Please confirm record un-linking!`)) {
            return;
        }

        this.unlinkHandler.emit();
    }

    goToKeePassConnect() {
        this.store.dispatch(NAVIGATION_ACTIONS.Go({
            path: [{outlets: {[SETTINGS_OUTLET]: `${SETTINGS_PATH}/keepass-associate-settings`}}],
        }));
    }
}
