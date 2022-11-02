import {CommonModule} from "@angular/common";
import {LetModule} from "@ngrx/component";
import {NgModule} from "@angular/core";
import {NgSelectModule} from "@ng-select/ng-select";
import {ReactiveFormsModule} from "@angular/forms";

import {UnreadBadgeComponent} from "src/web/browser-window/app/_shared/unread-badge.component";

@NgModule({
    imports: [
        CommonModule,
        NgSelectModule,
        LetModule,
        ReactiveFormsModule,
    ],
    declarations: [
        UnreadBadgeComponent,
    ],
    exports: [
        CommonModule,
        NgSelectModule,
        LetModule,
        ReactiveFormsModule,
        UnreadBadgeComponent,
    ],
})
export class SharedModule {}
