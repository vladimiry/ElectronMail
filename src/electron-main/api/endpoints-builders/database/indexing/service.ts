import {chunk, pick} from "remeda";
import {concatMap, filter, first} from "rxjs/operators";
import electronLog from "electron-log";
import {lastValueFrom, race, throwError, timer} from "rxjs";
import UUID from "pure-uuid";

import {Config} from "src/shared/model/options";
import {curryFunctionMembers} from "src/shared/util";
import {DbAccountPk, FsDbAccount, INDEXABLE_MAIL_FIELDS, Mail} from "src/shared/model/database";
import {hrtimeDuration} from "src/electron-main/util";
import {IPC_MAIN_API_DB_INDEXER_REQUEST$, IPC_MAIN_API_DB_INDEXER_RESPONSE$} from "src/electron-main/api/const";
import {IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS, IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS} from "src/shared/api/main-process/actions";
import {ofType} from "src/shared/util/ngrx-of-type";
import {readMailBody} from "src/shared/util/entity";
import {UnionOf} from "src/shared/util/ngrx";

const logger = curryFunctionMembers(electronLog, __filename);

type narrowIndexActionPayloadType = (
    payload: Omit<Extract<UnionOf<typeof IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS>, {type: "Index"}>["payload"], "uid">,
) => typeof payload;

export const narrowIndexActionPayload: narrowIndexActionPayloadType = ((): narrowIndexActionPayloadType => {
    const fieldsToIndex = ["pk", ...INDEXABLE_MAIL_FIELDS] as const;
    // @ts-expect-error 5.6.3=>5.7.2: remeda's "pick" started actiong weirdly
    const result: narrowIndexActionPayloadType = ({key, remove, add}) => {
        return {
            key,
            remove,
            add: add.map((mail) => {
                return {...pick(mail, fieldsToIndex), body: readMailBody(mail)};
            }),
        };
    };

    return result;
})();

async function indexMails(mails: Array<DeepReadonly<Mail>>, key: DeepReadonly<DbAccountPk>, timeoutMs: number): Promise<void> {
    logger.info(nameof(indexMails));

    const duration = hrtimeDuration();
    const uid = new UUID(4).format();

    setTimeout(() => {
        IPC_MAIN_API_DB_INDEXER_REQUEST$.next(
            IPC_MAIN_API_DB_INDEXER_REQUEST_ACTIONS.Index({uid, ...narrowIndexActionPayload({key, remove: [], add: mails})}),
        );
    });

    await lastValueFrom(
        race(
            IPC_MAIN_API_DB_INDEXER_RESPONSE$.pipe(
                ofType(IPC_MAIN_API_DB_INDEXER_RESPONSE_ACTIONS.IndexingResult),
                filter(({payload}) => payload.uid === uid),
                first(),
            ),
            timer(timeoutMs).pipe(
                concatMap(() => throwError(new Error(`Failed index emails in ${timeoutMs}ms (mails portions size: ${mails.length})`))),
            ),
        ),
    );

    logger.verbose(nameof(indexMails), "end", {indexed: mails.length, duration: duration.end()});
}

export async function indexAccount(
    {mails}: DeepReadonly<FsDbAccount>,
    key: DeepReadonly<DbAccountPk>,
    {indexingBootstrapBufferSize, timeouts: {indexingBootstrap: timeoutMs}}: DeepReadonly<Config>,
): Promise<void> {
    logger.info(nameof(indexAccount));
    const duration = hrtimeDuration();
    for (const mailsChunk of chunk(Object.values(mails), indexingBootstrapBufferSize)) {
        await indexMails(mailsChunk, key, timeoutMs);
    }
    logger.verbose(nameof(indexAccount), "end", {indexedCount: mails.size, duration: duration.end()});
}
