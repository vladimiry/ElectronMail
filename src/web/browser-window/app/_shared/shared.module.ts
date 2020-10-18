import {CommonModule} from "@angular/common";
import {NgModule} from "@angular/core";
import {NgSelectModule} from "@ng-select/ng-select";
import {ReactiveComponentModule} from "@ngrx/component";
import {ReactiveFormsModule} from "@angular/forms";

import {UnreadBadgeComponent} from "src/web/browser-window/app/_shared/unread-badge.component";

@NgModule({
    imports: [
        CommonModule,
        NgSelectModule,
        ReactiveComponentModule,
        ReactiveFormsModule,
    ],
    declarations: [
        UnreadBadgeComponent,
    ],
    exports: [
        CommonModule,
        NgSelectModule,
        ReactiveComponentModule,
        ReactiveFormsModule,
        UnreadBadgeComponent,
    ],
})
export class SharedModule {}
