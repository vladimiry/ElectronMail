import electronLog from "electron-log";
import {UnionOf} from "@vladimiry/unionize";
import {concatMap, filter, map, take} from "rxjs/operators";
import {pick} from "ramda";
import {race, throwError, timer} from "rxjs";
import {v4 as uuid} from "uuid";

import {Config} from "src/shared/model/options";
import {DbAccountPk, INDEXABLE_MAIL_FIELDS_STUB_CONTAINER, Mail, MemoryDbAccount} from "src/shared/model/database";
import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION$, IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$} from "src/electron-main/api/constants";
import {IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS, IPC_MAIN_API_DB_INDEXER_ON_ACTIONS} from "src/shared/api/main";
import {curryFunctionMembers} from "src/shared/util";
import {hrtimeDuration} from "src/electron-main/util";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/api/endpoints-builders/database/indexing]");

export const narrowIndexActionPayload: (
    payload: Omit<Extract<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_NOTIFICATION_ACTIONS>, { type: "Index" }>["payload"], "uid">,
) => typeof payload = (() => {
    type Fn = typeof narrowIndexActionPayload;
    type Mails = ReturnType<Fn>["add"];

    const mailFieldsToSelect = [
        ((name: keyof Pick<Unpacked<Mails>, "pk">) => name)("pk"),
        ...Object.keys(INDEXABLE_MAIL_FIELDS_STUB_CONTAINER),
    ] as Array<keyof Unpacked<Mails>>;

    const result: Fn = ({key, remove, add}) => {
        return {
            key,
            remove,
            add: add.map((mail) => pick(mailFieldsToSelect, mail)),
        };
    };

    return result;
})();

export async function indexAccount(account: MemoryDbAccount, key: DbAccountPk, config: Config): Promise<void> {
    logger.info("indexAccount()");

    const duration = hrtimeDuration();
    const buffer: Mail[] = [];

    for (const mail of account.mails.values()) {
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

async function indexMails(
    mails: Mail[],
    key: DbAccountPk,
    timeoutMs: number,
): Promise<Extract<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_ON_ACTIONS>, { type: "IndexingResult" }>["payload"]> {
    logger.info("indexMails()");

    const duration = hrtimeDuration();
    const uid = uuid();
    const result$ = race(
        IPC_MAIN_API_DB_INDEXER_ON_NOTIFICATION$.pipe(
            filter(IPC_MAIN_API_DB_INDEXER_ON_ACTIONS.is.IndexingResult),
            filter(({payload}) => payload.uid === uid),
            map(({payload}) => payload),
            take(1),
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

    return await result$
        .toPromise()
        .then((value) => {
            logger.verbose("indexMails() end", {indexed: mails.length, duration: duration.end()});
            return value;
        });
}
