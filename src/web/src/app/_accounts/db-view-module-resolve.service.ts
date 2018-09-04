import {ComponentFactory, ComponentRef, Injectable, Injector, NgModuleFactoryLoader} from "@angular/core";

import {DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN, DbViewEntryComponent} from "src/web/src/app/app.constants";
import {MemoryDb} from "src/shared/model/database";

@Injectable()
export class DbViewModuleResolve {

    private state: {
        resolveComponentFactory: () => Promise<ComponentFactory<DbViewEntryComponent>>;
    } = {
        resolveComponentFactory: async () => {
            const moduleFactory = await this.moduleLoader.load("./_db-view/db-view.module#DbViewModule");
            const moduleRef = moduleFactory.create(this.injector);
            const component = moduleRef.injector.get(DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN);
            this.state.resolveComponentFactory = async () => moduleRef.componentFactoryResolver.resolveComponentFactory(component);
            return await this.state.resolveComponentFactory();
        },
    };

    constructor(
        private moduleLoader: NgModuleFactoryLoader,
        private injector: Injector,
    ) {}

    async buildComponentRef(key: { type: keyof MemoryDb, login: string }): Promise<ComponentRef<DbViewEntryComponent>> {
        const factory = await this.state.resolveComponentFactory();
        const componentRef = factory.create(this.injector);

        componentRef.instance.key = key;

        return componentRef;
    }
}
