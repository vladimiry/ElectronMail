import {EffectsModule} from "@ngrx/effects";
import {NgModule} from "@angular/core";
import {PopoverModule} from "ngx-bootstrap/popover";

import {NotificationEffects} from "./notification.effects";
import {NotificationItemComponent} from "./notification-item.component";
import {NotificationListComponent} from "./notification-list.component";
import {NotificationRoutingModule} from "./notification.routing.module";
import {SharedModule} from "src/web/src/app/_shared/shared.module";

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
