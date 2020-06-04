import {Compiler, ComponentFactory, ComponentRef, Injectable, Injector, ViewContainerRef} from "@angular/core";

import {DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN} from "src/web/browser-window/app/app.constants";
import {DbAccountPk} from "src/shared/model/database";

type DbViewEntryComponent = import("src/web/browser-window/app/_db-view/db-view-entry.component").DbViewEntryComponent;

@Injectable()
export class DbViewModuleResolve {

    private state: {
        resolveComponentFactory: () => Promise<ComponentFactory<DbViewEntryComponent>>;
    } = {
        resolveComponentFactory: async () => {
            const {DbViewModule} = await import(/* webpackChunkName: "_db-view" */ "src/web/browser-window/app/_db-view/db-view.module");
            const compiler = this.injector.get(Compiler);
            const moduleFactory = await compiler.compileModuleAsync(DbViewModule);
            const moduleRef = moduleFactory.create(this.injector);
            const component = moduleRef.injector.get(DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN);
            const componentFactory = moduleRef.componentFactoryResolver.resolveComponentFactory(component);

            // memoize resolved factory
            this.state.resolveComponentFactory = async () => componentFactory;

            return componentFactory;
        },
    };

    constructor(
        private injector: Injector,
    ) {}

    async mountDbViewEntryComponent(
        container: ViewContainerRef,
        dbAccountPk: DbAccountPk,
    ): Promise<ComponentRef<DbViewEntryComponent>> {
        const componentFactory = await this.state.resolveComponentFactory();
        const componentRef = container.createComponent(componentFactory);

        componentRef.instance.dbAccountPk = dbAccountPk;
        componentRef.changeDetectorRef.detectChanges();

        return componentRef;
    }
}
