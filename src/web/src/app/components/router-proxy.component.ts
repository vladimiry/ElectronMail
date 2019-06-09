import {ActivatedRoute} from "@angular/router";
import {Component, HostBinding, OnDestroy, OnInit} from "@angular/core";
import {Subscription} from "rxjs";
import {filter, map} from "rxjs/operators";

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

    ngOnInit() {
        this.subscription.add(
            this.route.data
                .pipe(
                    map((data) => data.ROUTER_DATA_OUTLET_PROP),
                    filter((outlet) => Boolean(outlet)),
                )
                .subscribe((outlet) => this.outlet = outlet),
        );
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }
}
