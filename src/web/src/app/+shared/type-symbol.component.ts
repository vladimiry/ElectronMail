import {ChangeDetectionStrategy, Component, Input} from "@angular/core";

import {AccountType} from "src/shared/model/account";

@Component({
    selector: "email-securely-app-type-symbol",
    template: `<span [class]="type">{{ type }}</span>`,
    styleUrls: ["./type-symbol.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TypeSymbolComponent {
    @Input()
    type: AccountType;
}
