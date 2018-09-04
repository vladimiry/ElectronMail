import {NgModule} from "@angular/core";

import {DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN} from "src/web/src/app/app.constants";
import {DbViewEntryComponent} from "./db-view-entry.component";
import {SharedModule} from "src/web/src/app/_shared/shared.module";

@NgModule({
    imports: [
        SharedModule,
    ],
    declarations: [
        DbViewEntryComponent,
    ],
    entryComponents: [
        DbViewEntryComponent,
    ],
    providers: [
        {provide: DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN, useValue: DbViewEntryComponent},
    ],
})
export class DbViewModule {}
