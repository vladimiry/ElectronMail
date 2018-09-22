import {ChangeDetectionStrategy, Component, HostListener, Input} from "@angular/core";
import {Store} from "@ngrx/store";
import {clearTimeout} from "timers";

import {Mail} from "src/shared/model/database";
import {NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";
import {ONE_SECOND_MS} from "src/shared/constants";
import {State} from "src/web/src/app/store/reducers/db-view";

@Component({
    selector: "email-securely-app-db-view-mail-body",
    templateUrl: "./db-view-mail-body.component.html",
    styleUrls: ["./db-view-mail-body.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailBodyComponent {
    @Input()
    mail!: Mail;
    hoveredHref?: string;
    private hideHoveredHrefTimeoudId: any;

    constructor(
        private store: Store<State>,
    ) {}

    @HostListener("mouseout")
    onMouseOut() {
        delete this.hoveredHref;
    }

    @HostListener("mouseover", ["$event"])
    onMouseOver(event: MouseEvent) {
        const {link, href} = this.resolveLinkHref(event.target as Element);

        if (!link || !href) {
            this.hideHoveredHrefTimeoudId = setTimeout(() => delete this.hoveredHref, ONE_SECOND_MS / 2);
            return;
        }

        clearTimeout(this.hideHoveredHrefTimeoudId);
        this.hoveredHref = href;
    }

    @HostListener("click", ["$event"])
    click(event: MouseEvent) {
        const {element, link, href} = this.resolveLinkHref(event.target as Element);

        if (!link || element.classList.contains("prevent-default-event")) {
            return;
        }

        event.preventDefault();

        if (!href) {
            return;
        }

        this.store.dispatch(NAVIGATION_ACTIONS.OpenExternal({url: href}));
    }

    private resolveLinkHref(element: Element): { element: Element, link: boolean; href?: string } {
        const result: ReturnType<typeof DbViewMailBodyComponent.prototype.resolveLinkHref> = {
            element,
            link: element.tagName.toLowerCase() === "a",
        };

        if (!result.link) {
            return result;
        }

        result.href = (element as HTMLLinkElement).href;

        return result;
    }
}
