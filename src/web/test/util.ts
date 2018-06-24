import {getTestBed, TestBed} from "@angular/core/testing";
import {BrowserDynamicTestingModule, platformBrowserDynamicTesting} from "@angular/platform-browser-dynamic/testing";

export function initTestEnvironment(configure: (testBed: TestBed) => void) {
    const testBed: TestBed = getTestBed();

    if (!testBed.platform) {
        testBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
    }

    configure(testBed);

    // await testBed.compileComponents();

    return testBed;
}
