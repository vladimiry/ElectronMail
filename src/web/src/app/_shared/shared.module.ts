import {CommonModule} from "@angular/common";
import {NgModule} from "@angular/core";
import {NgSelectModule} from "@ng-select/ng-select";
import {ReactiveFormsModule} from "@angular/forms";

import {TypeSymbolComponent} from "./type-symbol.component";
import {UnreadBadgeComponent} from "./unread-badge.component";

@NgModule({
    imports: [
        CommonModule,
        ReactiveFormsModule,
        NgSelectModule,
    ],
    declarations: [
        TypeSymbolComponent,
        UnreadBadgeComponent,
    ],
    exports: [
        CommonModule,
        ReactiveFormsModule,
        NgSelectModule,
        TypeSymbolComponent,
        UnreadBadgeComponent,
    ],
})
export class SharedModule {}
