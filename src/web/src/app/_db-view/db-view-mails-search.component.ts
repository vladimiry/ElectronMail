import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    EventEmitter,
    OnDestroy,
    OnInit,
    Output,
    QueryList,
    ViewChildren,
} from "@angular/core";
import {EMPTY, Subject, combineLatest} from "rxjs";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {Store, select} from "@ngrx/store";
import {distinctUntilChanged, map, mergeMap, takeUntil} from "rxjs/operators";

import {AccountsSelectors} from "src/web/src/app/store/selectors";
import {DB_VIEW_ACTIONS} from "src/web/src/app/store/actions";
import {DbViewAbstractComponent} from "src/web/src/app/_db-view/db-view-abstract.component";
import {MAIL_FOLDER_TYPE, View} from "src/shared/model/database";
import {State} from "src/web/src/app/store/reducers/db-view";

@Component({
    selector: "email-securely-app-db-view-mails-search",
    templateUrl: "./db-view-mails-search.component.html",
    styleUrls: ["./db-view-mails-search.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsSearchComponent extends DbViewAbstractComponent implements OnInit, AfterViewInit, OnDestroy {
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

    accountProgress$ = this.dbAccountPk$.pipe(
        mergeMap(({login}) => this.store.pipe(
            select(AccountsSelectors.ACCOUNTS.pickAccount({login})),
            mergeMap((value) => value ? [value.progress] : EMPTY),
            distinctUntilChanged(),
        )),
    );

    searching$ = this.accountProgress$.pipe(
        map((value) => value.searching),
    );

    indexing$ = combineLatest(
        this.store.pipe(
            select(AccountsSelectors.FEATURED.globalProgress),
            distinctUntilChanged(),
        ),
        this.accountProgress$,
    ).pipe(
        map(([globalProgress, accountProgress]) => {
            return Boolean(globalProgress.indexing || accountProgress.indexing);
        }),
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

                    this.formControls.folders.addControl(pk, new FormControl(folderType !== MAIL_FOLDER_TYPE.SPAM));
                    this.foldersInfo.names[pk] = `${name} (${size})`;
                });

                this.foldersInfo.allPks = Object.keys(this.foldersInfo.names);
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
            .filter(([k, v]) => Boolean(v))
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

    ngOnDestroy() {
        super.ngOnDestroy();
        this.unSubscribe$.next();
        this.unSubscribe$.complete();
    }
}
