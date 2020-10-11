import UUID from "pure-uuid";
import electronLog from "electron-log";
import {UnionOf} from "@vladimiry/unionize";
import {concatMap, filter, first} from "rxjs/operators";
import {pick} from "remeda";
import {race, throwError, timer} from "rxjs";

import {Config} from "src/shared/model/options";
import {DbAccountPk, FsDbAccount, INDEXABLE_MAIL_FIELDS, Mail} from "src/shared/model/database";
import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION$, IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$,} from "src/electron-main/api/constants";
import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS, IPC_MAIN_API_DB_INDEXER_ON_ACTIONS,} from "src/shared/api/main";
import {curryFunctionMembers} from "src/shared/util";
import {hrtimeDuration} from "src/electron-main/util";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/api/endpoints-builders/database/indexing/service]");

export const narrowIndexActionPayload: (
    payload: StrictOmit<Extract<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS>, { type: "Index" }>["payload"], "uid">,
) => typeof payload = ((): typeof narrowIndexActionPayload => {
    type Fn = typeof narrowIndexActionPayload;
    type Mails = ReturnType<Fn>["add"];

    const fieldsToIndex = [
        ((name: keyof Pick<Unpacked<Mails>, "pk">): typeof name => name)("pk"),
        ...INDEXABLE_MAIL_FIELDS,
    ];

    const result: Fn = ({key, remove, add}) => {
        return {
            key,
            remove,
            add: add.map((mail) => pick(mail, fieldsToIndex)),
        };
    };

    return result;
})();

async function indexMails(
    mails: Array<DeepReadonly<Mail>>,
    key: DeepReadonly<DbAccountPk>,
    timeoutMs: number,
): Promise<void> {
    logger.info("indexMails()");

    const duration = hrtimeDuration();
    const uid = new UUID(4).format();
    const result$ = race(
        IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$.pipe(
            filter(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.is.IndexingResult),
            filter(({payload}) => payload.uid === uid),
            first(),
        ),
        timer(timeoutMs).pipe(
            concatMap(() => throwError(new Error(`Failed index emails in ${timeoutMs}ms (mails portions size: ${mails.length})`))),
        ),
    );

    IPC_MAIN_API_DB_INDEXER_NOTIFICATION$.next(
        IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS.Index({
            uid,
            ...narrowIndexActionPayload({
                key,
                remove: [],
                add: mails,
            }),
        }),
    );

    return result$
        .toPromise()
        .then(() => {
            logger.verbose("indexMails() end", {indexed: mails.length, duration: duration.end()});
        });
}

export async function indexAccount(
    account: DeepReadonly<FsDbAccount>,
    key: DeepReadonly<DbAccountPk>,
    config: DeepReadonly<Config>,
): Promise<void> {
    logger.info("indexAccount()");

    const duration = hrtimeDuration();
    const buffer: Mail[] = [];

    for (const mail of Object.values(account.mails)) {
        buffer.push(mail);

        if (buffer.length < config.indexingBootstrapBufferSize) {
            continue;
        }

        await indexMails(buffer, key, config.timeouts.indexingBootstrap);
        buffer.length = 0;
    }

    if (buffer.length) {
        await indexMails(buffer, key, config.timeouts.indexingBootstrap);
    }

    logger.verbose("indexAccount() end", {indexed: account.mails.size, duration: duration.end()});
}
