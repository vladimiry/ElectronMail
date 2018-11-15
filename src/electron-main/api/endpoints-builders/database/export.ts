import {Base64} from "js-base64";
import {join} from "path";
import {promisify} from "util";
import {v4 as uuid} from "uuid";
import {writeFile} from "fs";

import {APP_NAME} from "src/shared/constants";
import {File, Mail, MailAddress} from "src/shared/model/database";

const eol = `\r\n`;
const emlExtension = `.eml`;
const maxFileNameLength = 256 - emlExtension.length;
const safeFileNameRe = /[^A-Za-z0-9.]+/g;
const lineSplittingRe = /.{1,78}/g;
const emptyArray = Object.freeze([]);
const writeFileAsync = promisify(writeFile);

const formatEmlDate: (mail: Mail) => string = (() => {
    const dayNames = Object.freeze([`Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`]);
    const monthNames = Object.freeze([`Jan`, `Feb`, `Mar`, `Apr`, `May`, `Jun`, `Jul`, `Aug`, `Sep`, `Oct`, `Nov`, `Dec`]);

    return (mail: Mail) => {
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

export async function writeEmlFile(mail: Mail, dir: string): Promise<{ file: string }> {
    const fileNamePrefix = buildSortableDate(new Date(mail.sentDate));
    const fileName = `${fileNamePrefix} ${mail.subject}`.substr(0, maxFileNameLength) + emlExtension;
    const file = join(dir, fileName.replace(safeFileNameRe, `_`));
    const eml = buildEml(mail);

    await writeFileAsync(file, eml);

    return {file};
}

// TODO consider sanitizing "mail.body"
function buildEml(mail: Mail): string {
    const boundary = `----=${uuid()}@${APP_NAME}`;
    const subject = mail.subject && `=?UTF-8?B?${Base64.encode(mail.subject)}?=`;
    const body = (Base64.encode(mail.body).match(lineSplittingRe) || emptyArray).join(eol);
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

function formatAttachment(attachments: File[], boundary: string): string[] {
    // TODO attachment body
    return attachments.reduce((lines: string[], {mimeType, name}) => lines.concat([
        `--` + boundary, eol,
        `Content-Type: ${mimeType || "application/octet-stream"}`, eol,
        `Content-Transfer-Encoding: base64`, eol,
        `Content-Disposition: attachment; filename="${name}"`, eol,
        eol,
    ]), []);
}

function formatAddresses(prop: string, addresses: MailAddress[]): ReadonlyArray<string> | string[] {
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

function buildSortableDate(date: Date): string {
    const year = date.getFullYear();
    const month = padStart(date.getMonth());
    const day = padStart(date.getDate());
    const hours = padStart(date.getHours());
    const minutes = padStart(date.getMinutes());
    const seconds = padStart(date.getSeconds());

    return `${year}-${month}-${day} ${hours}h${minutes}m${seconds}s`;
}

function padStart(value: number, args: [number, string] = [2, `0`]) {
    return String.prototype.padStart.apply(value, args);
}
