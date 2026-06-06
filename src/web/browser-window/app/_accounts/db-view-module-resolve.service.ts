import {ComponentRef, createNgModule, inject, Injectable, Injector, Type, ViewContainerRef} from "@angular/core";

import {DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN} from "src/web/browser-window/app/app.constants";
import {WebAccountPk} from "src/web/browser-window/app/model";

type DbViewEntryComponent = import("src/web/browser-window/app/_db-view/db-view-entry.component").DbViewEntryComponent;

@Injectable()
export class DbViewModuleResolve {
    private injector = inject(Injector);

    private state: {resolveComponentType: () => Promise<Type<DbViewEntryComponent>>} = {
        resolveComponentType: async () => {
            const {DbViewModule} = await import(/* webpackChunkName: "_db-view" */ "src/web/browser-window/app/_db-view/db-view.module");
            const moduleRef = createNgModule(DbViewModule, this.injector);
            const componentClass = moduleRef.injector.get(DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN);
            // memoize resolved factory
            this.state.resolveComponentType = async () => componentClass;
            return componentClass;
        },
    };

    async mountDbViewEntryComponent(container: ViewContainerRef, webAccountPk: WebAccountPk): Promise<ComponentRef<DbViewEntryComponent>> {
        const componentClass = await this.state.resolveComponentType();
        const componentRef = container.createComponent(componentClass);
        componentRef.setInput("webAccountPk", webAccountPk);
        componentRef.changeDetectorRef.detectChanges();
        return componentRef;
    }
}
