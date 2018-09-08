import {EffectsModule} from "@ngrx/effects";
import {NgModule} from "@angular/core";

import {DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN} from "src/web/src/app/app.constants";
import {DbViewEffects} from "./db-view.effects";
import {DbViewEntryComponent} from "./db-view-entry.component";
import {DbViewFolderComponent} from "./db-view-folder.component";
import {DbViewMailComponent} from "./db-view-mail.component";
import {DbViewMailsComponent} from "./db-view-mails.component";
import {DbViewMailsListComponent} from "./db-view-mail-list.component";
import {SharedModule} from "src/web/src/app/_shared/shared.module";

@NgModule({
    imports: [
        SharedModule,
        EffectsModule.forFeature([DbViewEffects]),
    ],
    declarations: [
        DbViewEntryComponent,
        DbViewFolderComponent,
        DbViewMailComponent,
        DbViewMailsComponent,
        DbViewMailsListComponent,
    ],
    entryComponents: [
        DbViewEntryComponent,
    ],
    providers: [
        {provide: DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN, useValue: DbViewEntryComponent},
    ],
})
export class DbViewModule {}
