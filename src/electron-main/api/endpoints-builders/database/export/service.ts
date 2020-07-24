import UUID from "pure-uuid";
import fs from "fs";
import path from "path";
import truncateStringLength from "truncate-utf8-bytes";
import {Base64} from "js-base64";
import {deserializeError} from "serialize-error";
import {promisify} from "util";

import {DbExportMailAttachmentItem} from "src/electron-main/api/endpoints-builders/database/export/const";
import {File, Mail, MailAddress} from "src/shared/model/database";
import {PACKAGE_NAME} from "src/shared/constants";
import {ProtonMailExternalIdProp} from "src/shared/model/proton";

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
    const month = padStart(date.getMonth() + 1);
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
        if (error.code === "ENOENT") { // eslint-disable-line @typescript-eslint/no-unsafe-member-access
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
            const file = path.join(dir, fileName);
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

function formatAttachment(
    attachments: readonly File[],
    boundaryString: string,
    attachmentsContent?: Array<DbExportMailAttachmentItem>,
): string {
    if (attachmentsContent && attachmentsContent.length !== attachments.length) {
        throw new Error(
            [
                "Invalid attachments content items array length ",
                `(expected: ${String(attachments.length)}; actual: ${String(attachmentsContent?.length)})`,
            ].join(""),
        );
    }

    return attachments.reduce(
        (accumulator, {mimeType, name, id}, currentIndex) => {
            const base64Name = `=?UTF-8?B?${Base64.encode(name)}?=`;
            const attachment = attachmentsContent && attachmentsContent[currentIndex];
            const contentDispositionType = (attachment && attachment.Headers["content-disposition"]) || "attachment";
            const contentId = (attachment && attachment.Headers["content-id"]) || id;

            return accumulator + [
                `--${boundaryString}`, eol,
                `Content-Type: ${mimeType || "application/octet-stream"}; filename="${base64Name}"; name="${base64Name}"`, eol,
                "Content-Transfer-Encoding: base64", eol,
                `Content-Disposition: ${contentDispositionType}; filename=${base64Name}`, eol,
                `Content-ID: ${contentId}`, eol,
                eol,
                (
                    attachment
                        ? (
                            Buffer
                                .from(
                                    "data" in attachment
                                        ? attachment.data
                                        : deserializeError(attachment.serializedError).message
                                )
                                .toString("base64")
                        )
                        : ""
                ) + eol,
            ].join("");
        },
        "",
    );
}

function formatAddresses(prop: string, addresses: readonly MailAddress[]): ReadonlyArray<string> | string[] {
    if (!addresses.length) {
        return emptyArray;
    }

    return [
        `${prop}: `,
        addresses
            .reduce((items: string[], {name, address}) => items.concat([name ? `"${name}" <${address}>` : address]), [])
            .join(", "),
        eol,
    ];
}

const formatEmlDate: (mail: Mail) => string = (() => {
    const dayNames = Object.freeze(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    const monthNames = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);

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
function buildEml(
    mail: Mail,
    attachmentsContent?: Array<DbExportMailAttachmentItem>,
): string {
    const mixedBoundary = `=mixed-${new UUID(4).format()}@${PACKAGE_NAME}`;
    const relatedBoundary = `=related-${new UUID(4).format()}@${PACKAGE_NAME}`;
    const alternativeBoundary = `=alternative-${new UUID(4).format()}@${PACKAGE_NAME}`;
    const subject = mail.subject && `=?UTF-8?B?${Base64.encode(mail.subject)}?=`;
    const body = Base64.encode(
        mail.failedDownload
            ? mail.failedDownload.errorMessage
            : mail.body,
    );
    const rawMail: ProtonMailExternalIdProp = JSON.parse(mail.raw); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    const lines = [
        "MIME-Version: 1.0", eol,
        ...formatAddresses("From", [mail.sender]),
        ...formatAddresses("To", mail.toRecipients),
        ...formatAddresses("CC", mail.ccRecipients),
        ...formatAddresses("BCC", mail.bccRecipients),
        `Subject: ${subject}`, eol,
        `Date: ${formatEmlDate(mail)}`, eol,
        `Message-Id: <${rawMail.ExternalID || mail.id}>`, eol,
        ...[ /// mixed
            `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`, eol,
            eol,
            `--${mixedBoundary}`, eol,
            ...[ // related
                `Content-Type: multipart/related; boundary="${relatedBoundary}"`, eol,
                eol,
                `--${relatedBoundary}`, eol,
                ...[ // alternative
                    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`, eol,
                    eol,
                    `--${alternativeBoundary}`, eol,
                    "Content-Type: text/html; charset=utf-8", eol,
                    "Content-Transfer-Encoding: base64", eol,
                    eol,
                    body, eol,
                    eol,
                    `--${alternativeBoundary}--`, eol,
                    eol,
                ],
                ...(
                    // to prevent duplication if no attachment content set then we write stub attachments only once in "mixed" boundary
                    attachmentsContent
                        ? formatAttachment(mail.attachments, relatedBoundary, attachmentsContent) // inline attachments ("related" boundary)
                        : []
                ),
                `--${relatedBoundary}--`, eol,
            ],
            ...formatAttachment(mail.attachments, mixedBoundary, attachmentsContent), // attachments ("mixed" boundary)
            `--${mixedBoundary}--`,
        ],
        eol,
    ];

    // TODO export conversation thread headers: Message-ID, References

    return lines.join(``);
}

export async function writeEmlFile(
    mail: Mail,
    dir: string,
    attachments?: Array<DbExportMailAttachmentItem>,
): Promise<{ file: string }> {
    const file = await generateFileName(mail, dir);
    const eml = buildEml(mail, attachments);

    await fsAsync.writeFile(file, eml);

    return {file};
}
