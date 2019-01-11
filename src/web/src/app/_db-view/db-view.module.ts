import {CollapseModule} from "ngx-bootstrap/collapse";
import {EffectsModule} from "@ngrx/effects";
import {NgModule} from "@angular/core";
import {PopoverModule} from "ngx-bootstrap/popover";

import {DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN} from "src/web/src/app/app.constants";
import {DbViewEffects} from "./db-view.effects";
import {DbViewEntryComponent} from "./db-view-entry.component";
import {DbViewFolderComponent} from "./db-view-folder.component";
import {DbViewMailBodyComponent} from "./db-view-mail-body.component";
import {DbViewMailComponent} from "./db-view-mail.component";
import {DbViewMailTabComponent} from "./db-view-mail-tab.component";
import {DbViewMailsComponent} from "./db-view-mails.component";
import {DbViewService} from "./db-view.service";
import {SharedModule} from "src/web/src/app/_shared/shared.module";

@NgModule({
    imports: [
        CollapseModule,
        PopoverModule,
        SharedModule,
        EffectsModule.forFeature([DbViewEffects]),
    ],
    declarations: [
        DbViewEntryComponent,
        DbViewFolderComponent,
        DbViewMailComponent,
        DbViewMailsComponent,
        DbViewMailTabComponent,
        DbViewMailBodyComponent,
    ],
    entryComponents: [
        DbViewEntryComponent,
    ],
    providers: [
        DbViewService,
        {provide: DBVIEW_MODULE_ENTRY_COMPONENT_TOKEN, useValue: DbViewEntryComponent},
    ],
})
export class DbViewModule {}
