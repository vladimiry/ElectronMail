import {ActivatedRoute} from "@angular/router";
import {Component, HostBinding, inject} from "@angular/core";
import {filter, map} from "rxjs/operators";
import type {OnDestroy, OnInit} from "@angular/core";
import {Subscription} from "rxjs";

import {ROUTER_DATA_OUTLET_PROP} from "src/web/browser-window/app/app.constants";

@Component({
    standalone: false,
    selector: "electron-mail-router-proxy",
    template: "<router-outlet></router-outlet>",
    styleUrls: ["./router-proxy.component.scss"],
})
export class RouterProxyComponent implements OnInit, OnDestroy {
    private route = inject(ActivatedRoute);

    @HostBinding("class")
    outlet = "";

    private subscription = new Subscription();

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
