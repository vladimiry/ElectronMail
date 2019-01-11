import {ComponentFixture, TestBed, TestModuleMetadata} from "@angular/core/testing";
import {Location} from "@angular/common";
import {RouterTestingModule} from "@angular/router/testing";
import {Store, StoreModule} from "@ngrx/store";
import {produce} from "immer";

import {AppComponent} from "./app.component";
import {ESC_KEY, SETTINGS_OUTLET as outlet} from "src/web/src/app/app.constants";
import {NAVIGATION_ACTIONS} from "src/web/src/app/store/actions";
import {initTestEnvironment} from "src/web/test/util";

const moduleDef: TestModuleMetadata = Object.freeze({
    imports: [
        RouterTestingModule,
        StoreModule.forRoot({}),
    ],
    declarations: [AppComponent],
});

describe(AppComponent.name, () => {
    let testBed: TestBed;
    let fixture: ComponentFixture<AppComponent>;

    beforeEach(async () => {
        testBed = initTestEnvironment((tb) => tb.configureTestingModule(moduleDef));
        await testBed.compileComponents();
        fixture = testBed.createComponent(AppComponent);
    });

    it(`should call "onKeyUp"`, () => {
        const event = new KeyboardEvent("keyup");
        const onKeyUpSpy = spyOn(fixture.componentInstance, "onKeyUp");

        document.dispatchEvent(event);
        fixture.detectChanges();

        expect(onKeyUpSpy).toHaveBeenCalledWith(event);
    });

    it(`should iterate outlets`, async () => {
        const hashIndexOfSpy = jasmine.createSpy().and.returnValue(-1);
        const locationPathStub = jasmine.createSpy().and.returnValue({indexOf: hashIndexOfSpy});

        testBed.resetTestingModule();

        testBed = initTestEnvironment((tb) => tb.configureTestingModule(produce(moduleDef, (draftState) => {
            draftState.providers = [
                {provide: Location, useValue: {path: locationPathStub}},
            ];
        })));
        await testBed.compileComponents();
        fixture = testBed.createComponent(AppComponent);

        document.dispatchEvent(new KeyboardEvent("keyup", {key: ESC_KEY}));
        fixture.detectChanges();

        expect(hashIndexOfSpy).toHaveBeenCalledTimes((fixture.componentInstance as any).closeableOutlets.length);
    });

    it(`should call "location.path() => store.dispatch()"`, async () => {
        const locationPathStub = jasmine.createSpy().and.returnValue(`#/(${outlet}:settings/accounts//accounts-outlet:accounts)`);
        const storeDispatchStub = jasmine.createSpy();
        const event = new KeyboardEvent("keyup", {key: ESC_KEY});

        testBed.resetTestingModule();
        testBed = initTestEnvironment((tb) => tb.configureTestingModule(produce(moduleDef, (draftState) => {
            draftState.providers = [
                {provide: Location, useValue: {path: locationPathStub}},
                {provide: Store, useValue: {dispatch: storeDispatchStub}},
            ];
        })));

        await testBed.compileComponents();
        fixture = testBed.createComponent(AppComponent);

        document.dispatchEvent(event);
        fixture.detectChanges();

        expect(locationPathStub).toHaveBeenCalledWith(true);
        expect(locationPathStub).toHaveBeenCalledBefore(storeDispatchStub);
        expect(storeDispatchStub).toHaveBeenCalledWith(NAVIGATION_ACTIONS.Go({path: [{outlets: {[outlet]: null}}]}));
        expect(storeDispatchStub).toHaveBeenCalledTimes(1);
    });
});
