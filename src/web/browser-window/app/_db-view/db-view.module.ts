import {BsDropdownModule} from "ngx-bootstrap/dropdown";
import {CollapseModule} from "ngx-bootstrap/collapse";
import {EffectsModule} from "@ngrx/effects";
import {ModalModule} from "ngx-bootstrap/modal";
import {NgModule} from "@angular/core";
import {PopoverModule} from "ngx-bootstrap/popover";

import {DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN} from "src/web/browser-window/app/app.constants";
import {DbViewEffects} from "src/web/browser-window/app/_db-view/db-view.effects";
import {DbViewEntryComponent} from "src/web/browser-window/app/_db-view/db-view-entry.component";
import {DbViewFolderComponent} from "src/web/browser-window/app/_db-view/db-view-folder.component";
import {DbViewMailBodyComponent} from "src/web/browser-window/app/_db-view/db-view-mail-body.component";
import {DbViewMailComponent} from "src/web/browser-window/app/_db-view/db-view-mail.component";
import {DbViewMailTabComponent} from "src/web/browser-window/app/_db-view/db-view-mail-tab.component";
import {DbViewMailsComponent} from "src/web/browser-window/app/_db-view/db-view-mails.component";
import {DbViewMailsExportComponent} from "src/web/browser-window/app/_db-view/db-view-mails-export.component";
import {DbViewMailsSearchComponent} from "src/web/browser-window/app/_db-view/db-view-mails-search.component";
import {SharedModule} from "src/web/browser-window/app/_shared/shared.module";

@NgModule({
    imports: [
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
    ],
    entryComponents: [
        DbViewEntryComponent,
    ],
    providers: [
        {provide: DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN, useValue: DbViewEntryComponent},
    ],
})
export class DbViewModule {}
