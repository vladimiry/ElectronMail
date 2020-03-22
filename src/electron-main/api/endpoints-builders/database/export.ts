import electronLog from "electron-log";
import fs from "fs";
import truncateStringLength from "truncate-utf8-bytes";
import {Base64} from "js-base64";
import {Observable, from} from "rxjs";
import {app, dialog} from "electron";
import {join} from "path";
import {promisify} from "util";
import {switchMap} from "rxjs/operators";
import {v4 as uuid} from "uuid";

import {Context} from "src/electron-main/model";
import {File, Mail, MailAddress} from "src/shared/model/database";
import {IpcMainApiEndpoints, IpcMainServiceScan} from "src/shared/api/main";
import {PACKAGE_NAME} from "src/shared/constants";
import {curryFunctionMembers} from "src/shared/util";

const logger = curryFunctionMembers(electronLog, "[src/electron-main/api/endpoints-builders/database/export]");

const fsAsync = {
    stat: promisify(fs.stat),
    writeFile: promisify(fs.writeFile),
} as const;

const eol = "\r\n";
const emptyArray = [] as const;

const padStart = (value: number, args: [number, string] = [2, "0"]): string => {
    return String.prototype.padStart.apply(value, args);
};

const buildSortableDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = padStart(date.getMonth());
    const day = padStart(date.getDate());
    const hours = padStart(date.getHours());
    const minutes = padStart(date.getMinutes());
    const seconds = padStart(date.getSeconds());

    return `${year}-${month}-${day} ${hours}h${minutes}m${seconds}s`;
};

const fileExists = async (file: string): Promise<boolean> => {
    try {
        return (await fsAsync.stat(file)).isFile();
    } catch (error) {
        if (error.code === "ENOENT") {
            return false;
        }
        throw error;
    }
};

const generateFileName: (mail: Mail, dir: string) => Promise<string> = (() => {
    const extension = ".eml";
    const fileNameWithoutExtensionLengthLimit = 255 - extension.length;
    const safeFileNameRe = /[^A-Za-z0-9]+/g;
    const generatingLimit = 10;
    const resultFn: typeof generateFileName = async (mail, dir) => {
        for (let i = 0; i < generatingLimit; i++) {
            const fileNamePrefixEnding: string = i
                ? `_${i}`
                : "";
            const fileNamePrefix = buildSortableDate(new Date(mail.sentDate)) + fileNamePrefixEnding;
            const fileNameWithoutExtension = `${fileNamePrefix} ${mail.subject}`.replace(safeFileNameRe, "_");
            const fileName = truncateStringLength(fileNameWithoutExtension, fileNameWithoutExtensionLengthLimit) + extension;
            const file = join(dir, fileName);
            if (await fileExists(file)) {
                continue;
            }
            return file;
        }
        throw new Error(
            `Failed to generate unique file name for email with "${mail.subject}" subject after ${generatingLimit} iterations`,
        );
    };
    return resultFn;
})();

function formatAttachment(attachments: readonly File[], boundary: string): string[] {
    // TODO attachment body
    return attachments.reduce((lines: string[], {mimeType, name}) => lines.concat([
        `--` + boundary, eol,
        `Content-Type: ${mimeType || "application/octet-stream"}`, eol,
        `Content-Transfer-Encoding: base64`, eol,
        `Content-Disposition: attachment; filename="${name}"`, eol,
        eol,
    ]), []);
}

function formatAddresses(prop: string, addresses: readonly MailAddress[]): ReadonlyArray<string> | string[] {
    if (!addresses.length) {
        return emptyArray;
    }

    return [
        `${prop}: `,
        addresses
            .reduce((items: string[], {name, address}) => items.concat([name ? `"${name}" <${address}>` : address]), [])
            .join(`, `),
        eol,
    ];
}

const formatEmlDate: (mail: Mail) => string = (() => {
    const dayNames = Object.freeze([`Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`]);
    const monthNames = Object.freeze([`Jan`, `Feb`, `Mar`, `Apr`, `May`, `Jun`, `Jul`, `Aug`, `Sep`, `Oct`, `Nov`, `Dec`]);

    return (mail: Mail): string => {
        const date = new Date(mail.sentDate);
        const dayName = dayNames[date.getUTCDay()];
        const day = date.getUTCDate();
        const monthName = monthNames[date.getUTCMonth()];
        const year = date.getUTCFullYear();
        const hours = padStart(date.getUTCHours());
        const minutes = padStart(date.getUTCMinutes());
        const seconds = padStart(date.getUTCSeconds());

        return `${dayName}, ${day} ${monthName} ${year} ${hours}:${minutes}:${seconds} +0000`;
    };
})();

// TODO consider sanitizing "mail.body"
function buildEml(mail: Mail): string {
    const boundary = `----=${uuid()}@${PACKAGE_NAME}`;
    const subject = mail.subject && `=?UTF-8?B?${Base64.encode(mail.subject)}?=`;
    const body = Base64.encode(
        mail.failedDownload
            ? mail.failedDownload.errorMessage
            : mail.body,
    );
    const lines = [
        `MIME-Version: 1.0`, eol,
        ...formatAddresses(`From`, [mail.sender]),
        ...formatAddresses(`To`, mail.toRecipients),
        ...formatAddresses(`CC`, mail.ccRecipients),
        ...formatAddresses(`BCC`, mail.bccRecipients),
        `Subject: ${subject}`, eol,
        `Date: ${formatEmlDate(mail)}`, eol,
        `Content-Type: multipart/mixed; boundary="${boundary}"`, eol,
        eol,
        `--${boundary}`, eol,
        `Content-Type: text/html; charset=utf-8`, eol,
        `Content-Transfer-Encoding: base64`, eol,
        eol,
        body, eol,
        eol,
        ...formatAttachment(mail.attachments, boundary),
        `--${boundary}--`,
        eol,
    ];

    // TODO export conversation thread headers: Message-ID, References

    return lines.join(``);
}

export async function writeEmlFile(mail: Mail, dir: string): Promise<{ file: string }> {
    const file = await generateFileName(mail, dir);
    const eml = buildEml(mail);

    await fsAsync.writeFile(file, eml);

    return {file};
}

export async function buildDbExportEndpoints(
    ctx: Context,
): Promise<Pick<IpcMainApiEndpoints, "dbExport">> {
    return {
        dbExport({login, mailPks}) {
            logger.info("dbExport()");

            return from(
                (async (): Promise<{ filePaths: string[] }> => {
                    const browserWindow = ctx.uiContext && ctx.uiContext.browserWindow;

                    if (!browserWindow) {
                        throw new Error("Failed to resolve main app window");
                    }

                    const {filePaths = []} = await dialog.showOpenDialog(
                        browserWindow,
                        {
                            title: "Select directory to export emails to the EML files",
                            defaultPath: app.getPath("home"),
                            properties: ["openDirectory"],
                        },
                    );

                    return {filePaths};
                })(),
            ).pipe(
                switchMap(({filePaths}) => {
                    return new Observable<IpcMainServiceScan["ApiImplReturns"]["dbExport"]>((subscriber) => {
                        const [dir] = filePaths;

                        if (!dir) {
                            return subscriber.complete();
                        }

                        const account = ctx.db.getAccount({login});

                        if (!account) {
                            return subscriber.error(new Error(`Failed to resolve account by the provided "type/login"`));
                        }

                        const mails = mailPks
                            ? Object.values(account.mails).filter(({pk}) => mailPks.includes(pk))
                            : Object.values(account.mails);
                        const count = mails.length;

                        subscriber.next({count});

                        const promise = (async (): Promise<void> => {
                            for (let index = 0; index < count; index++) {
                                const {file} = await writeEmlFile(mails[index], dir);
                                subscriber.next({file, progress: +((index + 1) / count * 100).toFixed(2)});
                            }
                        })();

                        promise
                            .then(() => subscriber.complete())
                            .catch((error) => subscriber.error(error));
                    });
                }),
            );
        },
    };
}

