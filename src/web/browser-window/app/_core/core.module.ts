import {EffectsModule} from "@ngrx/effects";
import {inject, NgModule} from "@angular/core";

import {CoreService} from "src/web/browser-window/app/_core/core.service";
import {ElectronService} from "src/web/browser-window/app/_core/electron.service";
import {NavigationEffects} from "src/web/browser-window/app/_core/navigation.effects";

@NgModule({
    imports: [
        EffectsModule.forFeature([NavigationEffects]),
    ],
    providers: [
        ElectronService,
        CoreService,
    ],
})
export class CoreModule {
    constructor() {
        const parentModule = inject(CoreModule, {optional: true, skipSelf: true});

        if (parentModule) {
            throw new Error(`${CoreModule.name} is already loaded. Import it in the root app module only`);
        }
    }
}
