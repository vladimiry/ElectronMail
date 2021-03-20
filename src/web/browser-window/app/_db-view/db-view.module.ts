import {BsDatepickerModule} from "ngx-bootstrap/datepicker";
import {BsDropdownModule} from "ngx-bootstrap/dropdown";
import {CollapseModule} from "ngx-bootstrap/collapse";
import {EffectsModule} from "@ngrx/effects";
import {ModalModule} from "ngx-bootstrap/modal";
import {NgModule} from "@angular/core";
import {PopoverModule} from "ngx-bootstrap/popover";

import {DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN} from "src/web/browser-window/app/app.constants";
import {DbViewEffects} from "./db-view.effects";
import {DbViewEntryComponent} from "./db-view-entry.component";
import {DbViewFolderComponent} from "./db-view-folder.component";
import {DbViewMailBodyComponent} from "./db-view-mail-body.component";
import {DbViewMailComponent} from "./db-view-mail.component";
import {DbViewMailTabComponent} from "./db-view-mail-tab.component";
import {DbViewMailsComponent} from "./db-view-mails.component";
import {DbViewMailsExportComponent} from "./db-view-mails-export.component";
import {DbViewMailsSearchComponent} from "./db-view-mails-search.component";
import {DbViewMonacoEditorComponent} from "./db-view-monaco-editor.component";
import {SharedModule} from "src/web/browser-window/app/_shared/shared.module";

@NgModule({
    imports: [
        BsDatepickerModule,
        BsDropdownModule,
        CollapseModule,
        ModalModule,
        PopoverModule,
        SharedModule,
        EffectsModule.forFeature([DbViewEffects]),
    ],
    declarations: [
        DbViewEntryComponent,
        DbViewFolderComponent,
        DbViewMailBodyComponent,
        DbViewMailComponent,
        DbViewMailsComponent,
        DbViewMailsExportComponent,
        DbViewMailsSearchComponent,
        DbViewMailTabComponent,
        DbViewMonacoEditorComponent,
    ],
    entryComponents: [
        DbViewEntryComponent,
    ],
    providers: [
        {provide: DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN, useValue: DbViewEntryComponent},
    ],
})
export class DbViewModule {}
