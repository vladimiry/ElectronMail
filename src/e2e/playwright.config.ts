import {PlaywrightTestConfig} from "@playwright/test";

import {ONE_MINUTE_MS} from "src/shared/constants";

const config: PlaywrightTestConfig = {
    timeout: ONE_MINUTE_MS * 10,
    globalTimeout: ONE_MINUTE_MS * 10,
};

export default config;
