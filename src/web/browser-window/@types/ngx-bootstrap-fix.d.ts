// src/types/ngx-bootstrap-fix.d.ts
// fixes for ngx-bootstrap 19.x + Angular 21 + moduleResolution: "bundler"

declare module "ngx-bootstrap/component-loader" {
    export class ComponentLoaderFactory {
        constructor(...args: any[]); // eslint-disable-line @typescript-eslint/no-explicit-any
    }

    export class BsComponentRef<T = any> { // eslint-disable-line @typescript-eslint/no-explicit-any
        // only the properties ngx-bootstrap actually accesses in its code
        instance?: T;
        hostView?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
        location?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
        injector?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
        componentRef?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
        templateRef?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
        viewContainer?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
        // add these if you ever see new errors (rare)
        // changeDetectorRef?: any;
        // destroy(): void;
    }
}

declare module "ngx-bootstrap/positioning" {
    export class PositioningService {
        constructor(...args: any[]); // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    // fixes TS2305: AvailableBSPositions not exported
    export type AvailableBSPositions =
        | "top"
        | "bottom"
        | "left"
        | "right"
        | "top-left"
        | "top-right"
        | "bottom-left"
        | "bottom-right"
        | "left-top"
        | "left-bottom"
        | "right-top"
        | "right-bottom";
}

declare module "ngx-bootstrap/utils" {
    // fixes TS2305: IBsVersion not exported
    export interface IBsVersion {
        major: number;
        minor: number;
        version: string;
    }
    export function setTheme(theme: "bs3" | "bs4" | "bs5"): void;
    export function getBsVer(): IBsVersion;
    export const triggerEvent: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// fixes TS7016: mini-ngrx for timepicker
declare module "ngx-bootstrap/mini-ngrx" {
    export interface Action<T = string> {
        type: T;
        payload?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    export class MiniStore<T> {
        constructor(initialState: T);
        dispatch(action: Action): void;
        select<K>(mapFn: (state: T) => K): K;
    }
}

// fixes TS7016 + TS2339 for modal's focus-trap in Angular 21
declare module "ngx-bootstrap/focus-trap" {
    import {NgModule, Directive} from "@angular/core";

    // the directive itself
    export class FocusTrapDirective extends Directive {
        // no body needed
    }

    // the Ivy metadata expects this exact export
    @NgModule({
        declarations: [FocusTrapDirective],
        exports: [FocusTrapDirective],
    })
    export class FocusTrapModule {}

    // keep the catch-all in case something else sneaks in
    export const anything: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
