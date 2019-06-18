import {EffectsModule} from "@ngrx/effects";
import {NgModule} from "@angular/core";
import {PopoverModule} from "ngx-bootstrap/popover";

import {NotificationEffects} from "src/web/browser-window/app/_notification/notification.effects";
import {NotificationItemComponent} from "src/web/browser-window/app/_notification/notification-item.component";
import {NotificationListComponent} from "src/web/browser-window/app/_notification/notification-list.component";
import {NotificationRoutingModule} from "src/web/browser-window/app/_notification/notification.routing.module";
import {SharedModule} from "src/web/browser-window/app/_shared/shared.module";

@NgModule({
    imports: [
        PopoverModule,
        EffectsModule.forFeature([NotificationEffects]),
        SharedModule,
        NotificationRoutingModule,
    ],
    declarations: [
        NotificationItemComponent,
        NotificationListComponent,
    ],
})
export class NotificationModule {}
