import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    EventEmitter,
    OnInit,
    Output,
    QueryList,
    ViewChildren,
} from "@angular/core";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {Observable, Subject, combineLatest, merge} from "rxjs";
import {Store, select} from "@ngrx/store";
import {distinctUntilChanged, map, takeUntil, tap} from "rxjs/operators";

import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {DB_VIEW_ACTIONS} from "src/web/browser-window/app/store/actions";
import {DbViewAbstractComponent} from "src/web/browser-window/app/_db-view/db-view-abstract.component";
import {MAIL_FOLDER_TYPE, View} from "src/shared/model/database";
import {MailsBundleKey, State} from "src/web/browser-window/app/store/reducers/db-view";

@Component({
    selector: "electron-mail-db-view-mails-search",
    templateUrl: "./db-view-mails-search.component.html",
    styleUrls: ["./db-view-mails-search.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsSearchComponent extends DbViewAbstractComponent implements OnInit, AfterViewInit {
    readonly mailsBundleKey: MailsBundleKey = "searchMailsBundle";

    readonly mailsBundleItemsSize$: Observable<number> = this.instance$.pipe(
        map((instance) => instance[this.mailsBundleKey]),
        map(({items}) => items),
        distinctUntilChanged(),
        map(({length}) => length),
    );

    @ViewChildren("queryFormControl")
    readonly queryFormControlRefs!: QueryList<ElementRef>;

    readonly formControls = {
        query: new FormControl(
            null,
            Validators.required, // eslint-disable-line @typescript-eslint/unbound-method
        ),
        folders: new FormGroup({}),
        allFoldersToggled: new FormControl(false),
        sentDateAfter: new FormControl(),
        hasAttachments: new FormControl(false),
    };

    readonly form = new FormGroup(this.formControls);

    @Output()
    readonly backToListHandler = new EventEmitter<void>();

    readonly selectedMail$ = this.instance$.pipe(
        map((value) => value.selectedMail),
    );

    readonly accountProgress$ = this.account$.pipe(
        map((account) => account.progress),
        distinctUntilChanged(),
    );

    readonly searching$: Observable<boolean> = this.accountProgress$.pipe(
        map((value) => Boolean(value.searching)),
        tap(this.markDirty.bind(this)),
    );

    readonly indexing$: Observable<boolean> = combineLatest([
        this.store.pipe(
            select(AccountsSelectors.FEATURED.globalProgress),
            distinctUntilChanged(),
        ),
        this.accountProgress$,
    ]).pipe(
        map(([globalProgress, accountProgress]) => {
            return Boolean(globalProgress.indexing || accountProgress.indexing);
        }),
        tap(this.markDirty.bind(this)),
    );

    readonly folders$ = this.instance$.pipe(
        map((value) => [...value.folders.system, ...value.folders.custom]),
    );

    private readonly formFolderControlsInitialized$ = new Subject();

    readonly selectedPks$: Observable<Array<View.Folder["pk"]>> = merge(
        this.formFolderControlsInitialized$,
        this.formControls.folders.valueChanges,
    ).pipe(
        map(() => this.resolveSelectedPks()),
    );

    private readonly defaultUncheckedFolderIds: ReadonlySet<string> = new Set([
        MAIL_FOLDER_TYPE.ALL,
        MAIL_FOLDER_TYPE.SPAM,
    ]);

    constructor(
        store: Store<State>,
    ) {
        super(store);
    }

    ngOnInit(): void {
        this.folders$
            .pipe(takeUntil(this.ngOnDestroy$))
            .subscribe((folders) => {
                const pks = folders.map((folder) => folder.pk);

                Object.keys(this.formControls.folders).forEach((name) => {
                    if (!pks.includes(name)) {
                        this.formControls.folders.removeControl(name);
                    }
                });

                folders.forEach(({pk, folderType}) => {
                    if (this.formControls.folders.contains(pk)) {
                        return;
                    }
                    this.formControls.folders.addControl(pk, new FormControl(!this.defaultUncheckedFolderIds.has(folderType)));
                });

                if (!this.formFolderControlsInitialized$.closed) {
                    setTimeout(() => { // execute below code after folder form controls got rendered (next change detection tick)
                        this.formFolderControlsInitialized$.next();
                        this.formFolderControlsInitialized$.complete();
                    });
                }
            });

        this.formControls.allFoldersToggled.valueChanges
            .pipe(takeUntil(this.ngOnDestroy$))
            .subscribe(() => {
                const {value} = this.formControls.allFoldersToggled; // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                Object.values(this.formControls.folders.controls).forEach((control) => {
                    control.patchValue(value);
                });
            });
    }

    resolveSelectedPks(): Unpacked<typeof DbViewMailsSearchComponent.prototype.selectedPks$> {
        // eslint-disable-next-line prefer-destructuring, @typescript-eslint/no-unsafe-assignment
        const value: Record<View.Folder["pk"], boolean> = this.formControls.folders.value;

        return Object.entries(value)
            .filter(([, v]) => Boolean(v))
            .map(([k]) => k);
    }

    ngAfterViewInit(): void {
        if (this.queryFormControlRefs.length) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            this.queryFormControlRefs.first.nativeElement.focus();
        }
    }

    backToList(): void {
        this.store.dispatch(DB_VIEW_ACTIONS.SelectMail({dbAccountPk: this.dbAccountPk}));
        this.store.dispatch(DB_VIEW_ACTIONS.ResetSearchMailsBundleItems({dbAccountPk: this.dbAccountPk}));
        this.backToListHandler.emit();
    }

    submit(): void {
        this.store.dispatch(
            DB_VIEW_ACTIONS.FullTextSearchRequest({
                ...this.dbAccountPk,
                query: this.formControls.query.value, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                sentDateAfter: this.formControls.sentDateAfter.value, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                hasAttachments: this.formControls.hasAttachments.value, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                folderPks: this.resolveSelectedPks(),
            }),
        );
    }
}
