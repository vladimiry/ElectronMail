import {CommonModule} from "@angular/common";
import {NgModule} from "@angular/core";
import {NgSelectModule} from "@ng-select/ng-select";
import {ReactiveFormsModule} from "@angular/forms";

import {UnreadBadgeComponent} from "src/web/browser-window/app/_shared/unread-badge.component";

@NgModule({
    imports: [
        CommonModule,
        ReactiveFormsModule,
        NgSelectModule,
    ],
    declarations: [
        UnreadBadgeComponent,
    ],
    exports: [
        CommonModule,
        ReactiveFormsModule,
        NgSelectModule,
        UnreadBadgeComponent,
    ],
})
export class SharedModule {}
