import {ErrorHandler, NgModule, Optional, SkipSelf} from "@angular/core";
import {EffectsModule} from "@ngrx/effects";

import {GlobalErrorHandler} from "./global-error-hander.service";
import {ElectronService} from "./electron.service";
import {EffectsService} from "./effects.service";
import {ErrorEffects} from "./error.effects";
import {NavigationEffects} from "./navigation.effects";

@NgModule({
    imports: [
        EffectsModule.forFeature([ErrorEffects]),
        EffectsModule.forFeature([NavigationEffects]),
    ],
    providers: [
        {
            provide: ErrorHandler,
            useClass: GlobalErrorHandler,
        },
        ElectronService,
        EffectsService,
    ],
})
export class CoreModule {
    constructor(@Optional() @SkipSelf() parentModule: CoreModule) {
        if (parentModule) {
            throw new Error(`${CoreModule.name} is already loaded. Import it in the root app module only`);
        }
    }
}
