import {remote} from "electron"; // tslint:disable-line:no-import-zones

import {ElectronExposure} from "src/shared/model/electron"; // tslint:disable-line:no-import-zones

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const ROLLING_RATE_LIMITER: ElectronExposure["rollingRateLimiter"] = remote.require("rolling-rate-limiter");
