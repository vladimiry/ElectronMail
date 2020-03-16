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
import {Observable, Subject, combineLatest} from "rxjs";
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

    @ViewChildren("query")
    queryElementRefQuery!: QueryList<ElementRef>;

    formControls = {
        query: new FormControl(null, Validators.required),
        folders: new FormGroup({}),
        allFoldersToggled: new FormControl(false),
    };

    form = new FormGroup(this.formControls);

    @Output()
    backToListHandler = new EventEmitter<void>();

    selectedMail$ = this.instance$.pipe(
        map((value) => value.selectedMail),
    );

    accountProgress$ = this.account$.pipe(
        map((account) => account.progress),
        distinctUntilChanged(),
    );

    searching$: Observable<boolean> = this.accountProgress$.pipe(
        map((value) => Boolean(value.searching)),
        tap(this.markDirty.bind(this)),
    );

    indexing$: Observable<boolean> = combineLatest([
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

    folders$ = this.instance$.pipe(
        map((value) => value.folders),
    );

    foldersInfo: {
        names: Record<View.Folder["pk"], View.Folder["name"]>,
        allPks: Array<View.Folder["pk"]>;
        selectedPks: Array<View.Folder["pk"]>;
    } = {
        names: {},
        allPks: [],
        selectedPks: [],
    };

    private readonly defaultUncheckedFolderIds: ReadonlySet<string> = new Set([
        MAIL_FOLDER_TYPE.ALL,
        MAIL_FOLDER_TYPE.SPAM,
    ]);

    private unSubscribe$ = new Subject();

    constructor(
        store: Store<State>,
    ) {
        super(store);
    }

    ngOnInit() {
        this.folders$
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe(({system, custom}) => {
                const folders = [...system, ...custom];
                const pks = folders.map((folder) => folder.pk);

                Object.keys(this.formControls.folders).forEach((name) => {
                    if (!pks.includes(name)) {
                        this.formControls.folders.removeControl(name);
                    }
                });

                folders.forEach(({pk, name, folderType, size}) => {
                    if (this.formControls.folders.contains(pk)) {
                        return;
                    }

                    this.formControls.folders.addControl(pk, new FormControl(!this.defaultUncheckedFolderIds.has(folderType)));
                    this.foldersInfo.names[pk] = `${name} (${size})`;
                });

                this.foldersInfo.allPks = Object.keys(this.foldersInfo.names);
                this.foldersInfo.selectedPks = this.resolveSelectedPks();
            });

        this.formControls.folders.valueChanges
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe(() => {
                this.foldersInfo.selectedPks = this.resolveSelectedPks();
            });

        this.formControls.allFoldersToggled.valueChanges
            .pipe(takeUntil(this.unSubscribe$))
            .subscribe(() => {
                const {value} = this.formControls.allFoldersToggled;
                Object.values(this.formControls.folders.controls).forEach((control) => {
                    control.patchValue(value);
                });
            });
    }

    resolveSelectedPks(): typeof DbViewMailsSearchComponent.prototype.foldersInfo.selectedPks {
        const value: Record<View.Folder["pk"], boolean> = this.formControls.folders.value;

        return Object.entries(value)
            .filter(([, v]) => Boolean(v))
            .map(([k]) => k);
    }

    ngAfterViewInit() {
        if (this.queryElementRefQuery.length) {
            this.queryElementRefQuery.first.nativeElement.focus();
        }
    }

    backToList() {
        this.store.dispatch(DB_VIEW_ACTIONS.SelectMail({dbAccountPk: this.dbAccountPk}));
        this.store.dispatch(DB_VIEW_ACTIONS.ResetSearchMailsBundleItems({dbAccountPk: this.dbAccountPk}));
        this.backToListHandler.emit();
    }

    submit() {
        this.store.dispatch(DB_VIEW_ACTIONS.FullTextSearchRequest({
            ...this.dbAccountPk,
            query: this.formControls.query.value,
            folderPks: this.resolveSelectedPks(),
        }));
    }
}
