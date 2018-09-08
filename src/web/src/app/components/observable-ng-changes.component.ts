import {BehaviorSubject, Observable, of} from "rxjs";
import {OnChanges, OnDestroy, SimpleChanges} from "@angular/core";
import {distinctUntilChanged, mergeMap} from "rxjs/operators";

export class ObservableNgChangesComponent implements OnChanges, OnDestroy {
    protected ngChanges = new BehaviorSubject<Partial<{ [k in keyof this]: this[k] }>>({});

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
    }

    protected ngOnChangesObservable<K extends keyof this>(propertyName: K): Observable<this[K]> {
        return this.ngChanges.pipe(
            mergeMap((props) => propertyName in props ? of(props[propertyName] as this[K]) : []),
            distinctUntilChanged(),
        );
    }
}
