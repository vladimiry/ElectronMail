import {EMPTY, from, Observable, Subscriber} from "rxjs";

import {Endpoints} from "src/shared/api/main";
import {Mail} from "src/electron-main/database/entity/entities";
import {nSQL} from "src/electron-main/database/nano-sql";

export async function buildEndpoints(): Promise<Pick<Endpoints, "databaseUpsert" | "databaseObserveTest">> {
    return {
        databaseUpsert: ({table, data}) => from((async () => {
            await nSQL(table).execUpsertQuery(data);
            return EMPTY.toPromise();
        })()),

        // TODO release: remove "databaseObserveTest" method
        databaseObserveTest: () => {
            return Observable.create((observer: Subscriber<Mail[]>) => {
                nSQL()
                    .observable<Mail[]>(() => {
                        return nSQL("Mail").query("select").emit();
                    })
                    .subscribe({
                        next: ((rows: Mail[]) => {
                            // TODO release: disable console.log stuff
                            // tslint:disable-next-line:no-console
                            console.log({rows});
                            observer.next(rows);
                        }),
                        error: (error: Error) => observer.error(error),
                        complete: () => observer.complete(),
                    } as any);
            });
        },
    };
}
