import {NgModule} from "@angular/core";
import {CommonModule} from "@angular/common";
import {ReactiveFormsModule} from "@angular/forms";

import {KeePassRequestComponent} from "./keepass-request.component";
import {LetDirective} from "./let.directive";

@NgModule({
    imports: [
        CommonModule,
        ReactiveFormsModule,
    ],
    declarations: [
        KeePassRequestComponent,
        LetDirective,
    ],
    exports: [
        CommonModule,
        ReactiveFormsModule,
        KeePassRequestComponent,
    ],
})
export class SharedModule {}
