import {CommonModule} from "@angular/common";
import {LetDirective} from "@ngrx/component";
import {NgModule} from "@angular/core";
import {NgSelectModule} from "@ng-select/ng-select";
import {ReactiveFormsModule} from "@angular/forms";

import {UnreadBadgeComponent} from "src/web/browser-window/app/_shared/unread-badge.component";

@NgModule({
    imports: [
        CommonModule,
        NgSelectModule,
        LetDirective,
        ReactiveFormsModule,
    ],
    declarations: [
        UnreadBadgeComponent,
    ],
    exports: [
        CommonModule,
        NgSelectModule,
        LetDirective,
        ReactiveFormsModule,
        UnreadBadgeComponent,
    ],
})
export class SharedModule {}
