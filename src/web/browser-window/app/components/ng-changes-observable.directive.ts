import {BehaviorSubject, EMPTY, Observable, of, Subject, Subscription} from "rxjs";
import {Directive} from "@angular/core";
import {distinctUntilChanged, mergeMap, takeUntil} from "rxjs/operators";
import type {OnChanges, OnDestroy, SimpleChanges} from "@angular/core";

@Directive()
// so weird not single-purpose directive huh, https://github.com/angular/angular/issues/30080#issuecomment-539194668
// eslint-disable-next-line @angular-eslint/directive-class-suffix
export abstract class NgChangesObservableDirective implements OnChanges, OnDestroy {
    protected ngChanges = new BehaviorSubject<Partial<{ [k in keyof this]: this[k] }>>({});

    // TODO angular v16: use "takeUntilDestroyed"
    protected ngOnDestroy$ = new Subject<void>();

    private readonly subscription = new Subscription();

    ngOnChanges(changes: SimpleChanges): void {
        const props: Record<keyof typeof changes, any> // eslint-disable-line @typescript-eslint/no-explicit-any
         = {};

        Object.assign(props, this.ngChanges.value);

        for (const propertyName of Object.keys(changes)) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            props[propertyName] = changes[propertyName]?.currentValue;
        }

        this.ngChanges.next(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
            props as any,
        );
    }

    ngOnDestroy(): void {
        this.ngChanges.complete();
        this.ngOnDestroy$.next(void 0);
        this.ngOnDestroy$.complete();
        this.subscription.unsubscribe();
    }

    protected addSubscription(
        ...[teardown]: Parameters<typeof NgChangesObservableDirective.prototype.subscription.add>
    ): ReturnType<typeof NgChangesObservableDirective.prototype.subscription.add> {
        return this.subscription.add(teardown);
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
