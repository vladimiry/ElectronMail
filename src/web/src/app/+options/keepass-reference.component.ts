import {catchError, map, take} from "rxjs/operators";
import {Observable, of} from "rxjs";
import {Component, EventEmitter, Input, Output} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {Store} from "@ngrx/store";

import {KeePassClientConf, KeePassRef} from "_shared/model/keepasshttp";
import {SETTINGS_OUTLET, SETTINGS_PATH} from "_web_src/app/app.constants";
import {CoreActions, NavigationActions} from "_web_src/app/store/actions";
import {State} from "_web_src/app/store/reducers/options";
import {ElectronService} from "../+core/electron.service";

@Component({
    selector: `protonmail-desktop-app-keepass-reference`,
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
    submit() {
        const keePassRef = {
            url: this.url.value,
            uuid: this.uuid.value,
        };

        this.referencing = true;

        this.keePassClientConf$
            .pipe(take(1))
            .subscribe((keePassClientConf) => {
                this.electronService
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
                            delete this.referencing;
                            delete this.message;
                            return of(new CoreActions.Fail(error));
                        }),
                        take(1),
                    )
                    .subscribe((value) => {
                        if (value instanceof CoreActions.Fail) {
                            this.store.dispatch(value);
                        }
                    });
            });
    }

    unlink() {
        if (!confirm(`Please confirm record un-linking!`)) {
            return;
        }

        this.unlinkHandler.emit();
    }

    goToKeePassConnect() {
        this.store.dispatch(new NavigationActions.Go({
            path: [{outlets: {[SETTINGS_OUTLET]: `${SETTINGS_PATH}/keepass-associate-settings`}}],
        }));
    }
}
