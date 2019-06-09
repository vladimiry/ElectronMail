import {EffectsModule} from "@ngrx/effects";
import {NgModule} from "@angular/core";

import {NotificationEffects} from "./notification.effects";
import {NotificationItemComponent} from "./notification-item.component";
import {NotificationListComponent} from "./notification-list.component";
import {NotificationRoutingModule} from "./notification.routing.module";
import {SharedModule} from "src/web/src/app/_shared/shared.module";

@NgModule({
    imports: [
        SharedModule,
        EffectsModule.forFeature([NotificationEffects]),
        NotificationRoutingModule,
    ],
    declarations: [
        NotificationItemComponent,
        NotificationListComponent,
    ],
})
export class NotificationModule {}
