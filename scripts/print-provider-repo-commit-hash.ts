import {AccountType} from "src/shared/model/account";
import {LOG} from "scripts/lib";
import {PROVIDER_REPO} from "src/shared/constants";

const [, , ACCOUNT_TYPE] = process.argv as [null, null, AccountType];

LOG(PROVIDER_REPO[ACCOUNT_TYPE].commit);
