import {BrowserDynamicTestingModule, platformBrowserDynamicTesting} from "@angular/platform-browser-dynamic/testing";
import {TestBed, getTestBed} from "@angular/core/testing";

export function initTestEnvironment(configure: (testBed: TestBed) => void) {
    const testBed: TestBed = getTestBed();

    if (!testBed.platform) {
        testBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
    }

    configure(testBed);

    // await testBed.compileComponents();

    return testBed;
}
