import {ComponentFactory, ComponentRef, Injectable, Injector, NgModuleFactoryLoader} from "@angular/core";

import {DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN, DbViewEntryComponentInterface} from "src/web/src/app/app.constants";
import {DbAccountPk} from "src/shared/model/database";

@Injectable()
export class DbViewModuleResolve {

    private state: {
        resolveComponentFactory: () => Promise<ComponentFactory<DbViewEntryComponentInterface>>;
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

    async buildComponentRef(dbAccountPk: DbAccountPk): Promise<ComponentRef<DbViewEntryComponentInterface>> {
        const factory = await this.state.resolveComponentFactory();
        const componentRef = factory.create(this.injector);

        componentRef.instance.dbAccountPk = dbAccountPk;

        return componentRef;
    }
}
