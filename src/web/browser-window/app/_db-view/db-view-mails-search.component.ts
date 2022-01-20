import type {AfterViewInit, OnInit} from "@angular/core";
import {ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Output, QueryList, ViewChildren} from "@angular/core";
import {combineLatest, EMPTY, merge, Observable, Subject} from "rxjs";
import {distinctUntilChanged, map, mergeMap, switchMap, takeUntil, tap} from "rxjs/operators";
import {FormControl, FormGroup} from "@angular/forms";
import {select, Store} from "@ngrx/store";

import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {DB_VIEW_ACTIONS} from "src/web/browser-window/app/store/actions";
import {DbViewAbstractComponent} from "src/web/browser-window/app/_db-view/db-view-abstract.component";
import {Instance, State} from "src/web/browser-window/app/store/reducers/db-view";
import {SYSTEM_FOLDER_IDENTIFIERS, View} from "src/shared/model/database";

@Component({
    selector: "electron-mail-db-view-mails-search",
    templateUrl: "./db-view-mails-search.component.html",
    styleUrls: ["./db-view-mails-search.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsSearchComponent extends DbViewAbstractComponent implements OnInit, AfterViewInit {
    readonly mailsBundleKey$: Observable<Exclude<Instance["searchResultMailsBundleKey"], undefined>> = this.instance$.pipe(
        mergeMap((instance) => {
            return typeof instance.searchResultMailsBundleKey !== "undefined"
                ? [instance.searchResultMailsBundleKey]
                : EMPTY;
        }),
        distinctUntilChanged(),
    );

    readonly mailsBundleItemsSize$: Observable<number> = this.mailsBundleKey$.pipe(
        switchMap((mailsBundleKey) => {
            return this.instance$.pipe(
                map((instance) => instance[mailsBundleKey]),
                map(({items}) => items),
                distinctUntilChanged(),
                map(({length}) => length),
            );
        }),
    );

    @ViewChildren("queryFormControlRef")
    readonly queryFormControlRefs!: QueryList<ElementRef>;

    readonly formControls = {
        query: new FormControl(),
        folders: new FormGroup({}),
        allFoldersToggled: new FormControl(false),
        sentDateAfter: new FormControl(),
        hasAttachments: new FormControl(false),
    } as const;

    readonly form = new FormGroup(this.formControls);

    @Output()
    readonly backToListHandler = new EventEmitter<void>();

    readonly selectedMail$ = this.instance$.pipe(
        map((value) => value.selectedMail),
        distinctUntilChanged((prev, curr) => curr?.listMailPk === prev?.listMailPk),
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

    readonly selectedIds$: Observable<Array<View.Folder["id"]>> = merge(
        this.formFolderControlsInitialized$,
        this.formControls.folders.valueChanges,
    ).pipe(
        map(() => this.resolveSelectedIds()),
    );

    private readonly defaultUncheckedFolderIds: ReadonlySet<Unpacked<typeof SYSTEM_FOLDER_IDENTIFIERS._.values>> = new Set([
        SYSTEM_FOLDER_IDENTIFIERS["Virtual Unread"],
        SYSTEM_FOLDER_IDENTIFIERS["All Mail"],
        SYSTEM_FOLDER_IDENTIFIERS.Spam,
    ]);

    codeEditorOpen?: boolean;

    codeFilter?: string;

    constructor(
        readonly store: Store<State>,
    ) {
        super(store);
    }

    ngOnInit(): void {
        this.folders$
            .pipe(takeUntil(this.ngOnDestroy$))
            .subscribe((folders) => {
                const folderIds = folders.map((folder) => folder.id);

                Object.keys(this.formControls.folders).forEach((name) => {
                    if (!folderIds.includes(name)) {
                        this.formControls.folders.removeControl(name);
                    }
                });

                folders.forEach(({id}) => {
                    if (!this.formControls.folders.contains(id)) {
                        const selectedByDefault = !this.defaultUncheckedFolderIds.has(id);
                        this.formControls.folders.addControl(id, new FormControl(selectedByDefault));
                    }
                });

                if (!this.formFolderControlsInitialized$.closed) {
                    setTimeout(() => { // execute below code after folder form controls got rendered (next change detection tick)
                        this.formFolderControlsInitialized$.next(void 0);
                        this.formFolderControlsInitialized$.complete();
                    });
                }
            });

        this.formControls.allFoldersToggled.valueChanges
            .pipe(takeUntil(this.ngOnDestroy$))
            .subscribe(() => {
                const {value} = this.formControls.allFoldersToggled; // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                Object
                    .values(this.formControls.folders.controls)
                    .forEach((control) => control.patchValue(value));
            });
    }

    resolveSelectedIds(): Unpacked<typeof DbViewMailsSearchComponent.prototype.selectedIds$> {
        // eslint-disable-next-line prefer-destructuring, @typescript-eslint/no-unsafe-assignment
        const value: Record<View.Folder["id"], boolean> = this.formControls.folders.value;

        return Object.entries(value)
            .filter(([, value]) => Boolean(value))
            .map(([key]) => key);
    }

    ngAfterViewInit(): void {
        if (this.queryFormControlRefs.length) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            this.queryFormControlRefs.first.nativeElement.focus();
        }
    }

    backToList(): void {
        this.backToListHandler.emit();
    }

    onEditorContentChange({codeEditorContent}: { codeEditorContent?: string }): void {
        this.codeFilter = codeEditorContent;
    }

    submit(): void {
        this.store.dispatch(
            DB_VIEW_ACTIONS.FullTextSearchRequest({
                ...this.webAccountPk,
                query: this.formControls.query.value, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                sentDateAfter: this.formControls.sentDateAfter.value, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                hasAttachments: this.formControls.hasAttachments.value, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                folderIds: this.resolveSelectedIds(),
                ...(this.codeEditorOpen && {codeFilter: this.codeFilter}),
            }),
        );
    }
}
