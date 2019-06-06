import {remote} from "electron"; // tslint:disable-line:no-import-zones

import {ElectronExposure} from "src/shared/model/electron"; // tslint:disable-line:no-import-zones

export const ROLLING_RATE_LIMITER: ElectronExposure["rollingRateLimiter"] = remote.require("rolling-rate-limiter");
