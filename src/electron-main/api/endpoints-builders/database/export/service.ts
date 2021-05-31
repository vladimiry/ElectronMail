import UUID from "pure-uuid";
import fsAsync from "fs/promises";
import path from "path";
import truncateStringLength from "truncate-utf8-bytes";
import {Base64} from "js-base64";
import {deserializeError} from "serialize-error";

import {DbExportMailAttachmentItem} from "src/electron-main/api/endpoints-builders/database/export/const";
import {File, Mail, MailAddress} from "src/shared/model/database";
import {PACKAGE_NAME} from "src/shared/constants";
import {parseProtonRestModel, readMailBody} from "src/shared/entity-util";

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

const generateFileName: (mail: Mail, dir: string, fileType: "eml" | "json") => Promise<string> = (() => {
    const safeFileNameRe = /[^A-Za-z0-9]+/g;
    const generatingLimit = 10;
    const resultFn: typeof generateFileName = async (mail, dir, type) => {
        const extension = `.${type}`;
        const fileNameWithoutExtensionLengthLimit = 255 - extension.length;
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

const validateAttachmentsCount = ({downloaded, declared}: { downloaded?: number, declared: number }): void => {
    if (typeof downloaded === "number" && downloaded !== declared) {
        throw new Error(`Invalid attachments content items array length (downloaded: ${downloaded}; declared: ${declared})`);
    }
};

const formatExportedAttachmentContent = (attachmentContent: DeepReadonly<DbExportMailAttachmentItem>): string => {
    return Buffer
        .from(
            "data" in attachmentContent
                ? attachmentContent.data
                : deserializeError(attachmentContent.serializedError).message
        )
        .toString("base64");
};

const formatEmlAttachment = (
    attachments: readonly File[],
    boundaryString: string,
    attachmentsContent?: DeepReadonly<DbExportMailAttachmentItem[]>,
): string => {
    validateAttachmentsCount({downloaded: attachmentsContent?.length, declared: attachments.length});

    return attachments.reduce(
        (accumulator, {mimeType, name, id}, currentIndex) => {
            const base64Name = `=?UTF-8?B?${Base64.encode(name)}?=`;
            // TODO throw error of "attachment content" is falsy
            const attachmentContent = attachmentsContent && attachmentsContent[currentIndex];
            const contentDispositionType = (attachmentContent && attachmentContent.Headers["content-disposition"]) || "attachment";
            const contentId = (attachmentContent && attachmentContent.Headers["content-id"]) || id;

            return accumulator + [
                `--${boundaryString}`, eol,
                `Content-Type: ${mimeType || "application/octet-stream"}; filename="${base64Name}"; name="${base64Name}"`, eol,
                "Content-Transfer-Encoding: base64", eol,
                `Content-Disposition: ${contentDispositionType}; filename=${base64Name}`, eol,
                `Content-ID: ${contentId}`, eol,
                eol,
                (
                    attachmentContent
                        ? formatExportedAttachmentContent(attachmentContent)
                        // TODO throw error of "attachment content" is falsy
                        : ""
                ) + eol,
            ].join("");
        },
        "",
    );
};

const formatAddresses = (prop: string, addresses: readonly MailAddress[]): ReadonlyArray<string> | string[] => {
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
};

const formatEmlDate: (mail: Mail) => string = (() => {
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

    return (mail: Mail): string => {
        const date = new Date(mail.sentDate);
        const dayName = dayNames[date.getUTCDay()];
        const day = date.getUTCDate();
        const monthName = monthNames[date.getUTCMonth()];
        const year = date.getUTCFullYear();
        const hours = padStart(date.getUTCHours());
        const minutes = padStart(date.getUTCMinutes());
        const seconds = padStart(date.getUTCSeconds());

        return `${String(dayName)}, ${day} ${String(monthName)} ${year} ${hours}:${minutes}:${seconds} +0000`;
    };
})();

// TODO consider sanitizing "mail.body"
const contentBuilders: Readonly<Record<"eml" | "json", (
    mail: Mail,
    attachmentsContent?: DeepReadonly<DbExportMailAttachmentItem[]>,
) => string>> = {
    eml(mail, attachmentsContent) {
        const mixedBoundary = `=mixed-${new UUID(4).format()}@${PACKAGE_NAME}`;
        const relatedBoundary = `=related-${new UUID(4).format()}@${PACKAGE_NAME}`;
        const alternativeBoundary = `=alternative-${new UUID(4).format()}@${PACKAGE_NAME}`;
        const subject = mail.subject && `=?UTF-8?B?${Base64.encode(mail.subject)}?=`;
        const body = Base64.encode(
            mail.failedDownload
                ? mail.failedDownload.errorMessage
                : readMailBody(mail)
        );
        const rawMail = parseProtonRestModel(mail);
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
                            // inline attachments ("related" boundary)
                            ? formatEmlAttachment(mail.attachments, relatedBoundary, attachmentsContent)
                            : []
                    ),
                    `--${relatedBoundary}--`, eol,
                ],
                ...formatEmlAttachment(mail.attachments, mixedBoundary, attachmentsContent), // attachments ("mixed" boundary)
                `--${mixedBoundary}--`,
            ],
            eol,
        ];

        // TODO export conversation thread headers: Message-ID, References

        return lines.join("");

    },
    json(mail, attachmentsContent) {
        validateAttachmentsCount({downloaded: attachmentsContent?.length, declared: mail.attachments.length});

        const rawMail = parseProtonRestModel(mail);

        return JSON.stringify(
            {
                ...rawMail,
                Body: readMailBody(mail),
                EncryptedBody: rawMail.Body,
                Attachments: attachmentsContent
                    ? rawMail.Attachments.map((attachment, index) => {
                        const attachmentContent = attachmentsContent[index];
                        if (typeof attachmentContent === "undefined") {
                            throw new Error(`Failed to resolve attachment content by ${index} index`);
                        }
                        return {
                            ...attachment,
                            Content: formatExportedAttachmentContent(attachmentContent),
                        };
                    })
                    : rawMail.Attachments,
            },
            null,
            4,
        );
    },
};

export const writeFile = async (
    options: Readonly<{
        mail: Mail,
        fileType: "eml" | "json",
        exportDir: string,
        attachments?: DeepReadonly<DbExportMailAttachmentItem[]>
    }>
): Promise<{ file: string }> => {
    const file = await generateFileName(options.mail, options.exportDir, options.fileType);
    const content = contentBuilders[options.fileType](options.mail, options.attachments);

    await fsAsync.writeFile(file, content);

    return {file};
};
