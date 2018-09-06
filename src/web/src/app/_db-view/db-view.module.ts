import {NgModule} from "@angular/core";

import {DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN} from "src/web/src/app/app.constants";
import {DbViewEntryComponent} from "./db-view-entry.component";
import {DbViewFolderComponent} from "./db-view-folder.component";
import {DbViewMailComponent} from "./db-view-mail.component";
import {DbViewMailsComponent} from "./db-view-mails.component";
import {SharedModule} from "src/web/src/app/_shared/shared.module";

@NgModule({
    imports: [
        SharedModule,
    ],
    declarations: [
        DbViewEntryComponent,
        DbViewMailsComponent,
        DbViewFolderComponent,
        DbViewMailComponent,
    ],
    entryComponents: [
        DbViewEntryComponent,
    ],
    providers: [
        {provide: DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN, useValue: DbViewEntryComponent},
    ],
})
export class DbViewModule {}
