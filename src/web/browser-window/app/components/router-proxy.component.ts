import {ActivatedRoute} from "@angular/router";
import {Component, HostBinding} from "@angular/core";
import type {OnDestroy, OnInit} from "@angular/core";
import {Subscription} from "rxjs";
import {filter, map} from "rxjs/operators";

import {ROUTER_DATA_OUTLET_PROP} from "src/web/browser-window/app/app.constants";

@Component({
    selector: "electron-mail-router-proxy",
    template: "<router-outlet></router-outlet>",
    styleUrls: ["./router-proxy.component.scss"],
})
export class RouterProxyComponent implements OnInit, OnDestroy {
    @HostBinding("class")
    outlet = "";

    private subscription = new Subscription();

    constructor(
        private route: ActivatedRoute,
    ) {}

    ngOnInit(): void {
        this.subscription.add(
            this.route.data
                .pipe(
                    map((data) => {
                        return data[ROUTER_DATA_OUTLET_PROP]; // eslint-disable-line  @typescript-eslint/no-unsafe-return
                    }),
                    filter((outlet) => Boolean(outlet)),
                )
                .subscribe((outlet) => {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    this.outlet = outlet;
                }),
        );
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
