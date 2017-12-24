import {Directive, Input, TemplateRef, ViewContainerRef} from "@angular/core";

@Directive({
    // tslint:disable:directive-selector
    selector: "[ngLet]",
    // tslint:enable:directive-selector
})
export class LetDirective {
    context: any = {};

    constructor(private vcRef: ViewContainerRef, private templateRef: TemplateRef<any>) {}

    @Input()
    set ngVar(context: any) {
        this.context.$implicit = this.context.ngVar = context;
        this.updateView();
    }

    updateView() {
        this.vcRef.clear();
        this.vcRef.createEmbeddedView(this.templateRef, this.context);
    }
}
