import baseTest from "@playwright/test";

// TODO explore and extend the base "test" function by the custom "fixtures" thing of the "playwright" framework
//      see https://playwright.dev/docs/test-fixtures/
export const {default: test} = baseTest as unknown as { default: typeof baseTest };
