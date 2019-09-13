import {BehaviorSubject, EMPTY, Observable, Subject, of} from "rxjs";
import {OnChanges, OnDestroy, SimpleChanges} from "@angular/core";
import {distinctUntilChanged, mergeMap, takeUntil} from "rxjs/operators";

export abstract class NgChangesObservableComponent implements OnChanges, OnDestroy {
    protected ngChanges = new BehaviorSubject<Partial<{ [k in keyof this]: this[k] }>>({});

    protected ngOnDestroy$ = new Subject();

    ngOnChanges(changes: SimpleChanges) {
        const props: Record<keyof typeof changes, any> = {};

        Object.assign(props, this.ngChanges.value);

        for (const propertyName in changes) {
            if (!changes.hasOwnProperty(propertyName)) {
                continue;
            }
            props[propertyName] = changes[propertyName].currentValue;
        }

        this.ngChanges.next(props as any);
    }

    ngOnDestroy() {
        this.ngChanges.complete();
        this.ngOnDestroy$.next();
        this.ngOnDestroy$.complete();
    }

    protected ngChangesObservable<K extends keyof this>(propertyName: K): Observable<this[K]> {
        return this.ngChanges.pipe(
            mergeMap((props) => {
                return propertyName in props
                    ? of(props[propertyName] as this[K])
                    : EMPTY;
            }),
            distinctUntilChanged(),
            takeUntil(this.ngOnDestroy$),
        );
    }
}
