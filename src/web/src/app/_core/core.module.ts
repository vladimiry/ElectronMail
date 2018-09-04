import {EffectsModule} from "@ngrx/effects";
import {ErrorHandler, NgModule, Optional, SkipSelf} from "@angular/core";

import {CoreEffects} from "./core.effects";
import {ElectronService} from "./electron.service";
import {ErrorEffects} from "./error.effects";
import {GlobalErrorHandler} from "./global-error-handler.service";
import {NavigationEffects} from "./navigation.effects";

@NgModule({
    imports: [
        EffectsModule.forFeature([CoreEffects]),
        EffectsModule.forFeature([ErrorEffects]),
        EffectsModule.forFeature([NavigationEffects]),
    ],
    providers: [
        {
            provide: ErrorHandler,
            useClass: GlobalErrorHandler,
        },
        ElectronService,
    ],
})
export class CoreModule {
    constructor(@Optional() @SkipSelf() parentModule: CoreModule) {
        if (parentModule) {
            throw new Error(`${CoreModule.name} is already loaded. Import it in the root app module only`);
        }
    }
}
