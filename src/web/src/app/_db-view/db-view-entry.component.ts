import {BehaviorSubject, Subscription, merge} from "rxjs";
import {ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, OnInit, Renderer2} from "@angular/core";
import {Deferred} from "ts-deferred";
import {debounceTime, filter, switchMap} from "rxjs/operators";

import {DbEntitiesRecordContainer, FolderWithMailsReference, MAIL_FOLDER_TYPE, MemoryDb} from "src/shared/model/database";
import {DbViewEntryComponentInterface} from "src/web/src/app/app.constants";
import {ElectronService} from "src/web/src/app/_core/electron.service";
import {IPC_MAIN_API_NOTIFICATION_ACTIONS} from "src/shared/api/main";

export interface DbViewEntryComponentState {
    folders: FolderWithMailsReference[];
    contacts: DbEntitiesRecordContainer["contacts"];
    filters: { selectedFoldersMap: Map<FolderWithMailsReference["pk"], FolderWithMailsReference> };
}

type ComponentInterface = Pick<DbViewEntryComponentInterface, Extract<keyof DbViewEntryComponentInterface, string>>;

@Component({
    selector: "email-securely-app-db-view-entry",
    templateUrl: "./db-view-entry.component.html",
    styleUrls: ["./db-view-entry.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewEntryComponent implements ComponentInterface, OnDestroy, OnInit {
    @Input()
    key!: { type: keyof MemoryDb, login: string };

    private stateSubject$ = new BehaviorSubject<DbViewEntryComponentState>({
        folders: [], contacts: {}, filters: {selectedFoldersMap: new Map()},
    });

    // tslint:disable-next-line:member-ordering
    state$ = this.stateSubject$.asObservable();

    private subscription = new Subscription();

    constructor(
        private electronService: ElectronService,
        private renderer: Renderer2,
        private el: ElementRef,
    ) {}

    ngOnInit() {
        const notificationDeferred = new Deferred<void>();
        const ipcMainClientPreservedPayloadReferences = this.electronService.ipcMainClient({
            finishPromise: notificationDeferred.promise,
            serialization: "jsan",
        });

        this.subscription.add({unsubscribe: () => notificationDeferred.resolve()});

        this.subscription.add(
            merge(
                ipcMainClientPreservedPayloadReferences("dbGetAccountDataView")(this.key), // initial load
                ipcMainClientPreservedPayloadReferences("notification")().pipe(
                    filter(IPC_MAIN_API_NOTIFICATION_ACTIONS.is.DbPatchAccount),
                    // tslint:disable-next-line:ban
                    switchMap(() => ipcMainClientPreservedPayloadReferences("dbGetAccountDataView")(this.key)),
                ),
            ).pipe(
                debounceTime(300),
            ).subscribe((value) => {
                this.patchState(value);
            }),
        );
    }

    setVisibility(value: boolean) {
        this.renderer.setStyle(this.el.nativeElement, "display", value ? "block" : "none");
    }

    folderSelectionHandler(folder: FolderWithMailsReference) {
        // TODO enable multiple items selection
        this.patchState({filters: {selectedFoldersMap: new Map([[folder.pk, folder]])}});
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }

    private patchState(patch: Partial<DbViewEntryComponentState>) {
        const state = {...this.stateSubject$.value, ...patch};

        // filter out irrelevant folder filters
        for (const folderPk of state.filters.selectedFoldersMap.keys()) {
            if (!state.folders.some(({pk}) => pk === folderPk)) {
                state.filters.selectedFoldersMap.delete(folderPk);
            }
        }

        // set initial folder filter
        if (!state.filters.selectedFoldersMap.size) {
            const inboxFolder = state.folders.find(({folderType}) => folderType === MAIL_FOLDER_TYPE.INBOX);
            if (inboxFolder) {
                state.filters.selectedFoldersMap.set(inboxFolder.pk, inboxFolder);
            }
        }

        this.stateSubject$.next(state);
    }
}
