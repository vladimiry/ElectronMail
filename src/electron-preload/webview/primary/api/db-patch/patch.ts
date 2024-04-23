import {curryFunctionMembers} from "src/shared/util";
import * as Database from "src/electron-preload/webview/lib/database-entity";
import {DbPatch} from "src/shared/api/common";
import {isProtonApiError, sanitizeProtonApiError} from "src/electron-preload/lib/util";
import {LABEL_TYPE, SYSTEM_FOLDER_IDENTIFIERS} from "src/shared/model/database";
import {Logger} from "src/shared/model/common";
import {ProviderApi} from "src/electron-preload/webview/primary/provider-api/model";
import * as RestModel from "src/electron-preload/webview/lib/rest-model";

export const buildDbPatch = async (
    providerApi: ProviderApi,
    input: {events: Array<Pick<RestModel.Event, "Messages" | "Labels" | "Contacts">>; parentLogger: Logger},
    nullUpsert = false,
): Promise<DbPatch> => {
    const logger = curryFunctionMembers(input.parentLogger, nameof(buildDbPatch));
    const mapping:
        & Record<"mails" | "folders" | "contacts", {
            remove: Array<{pk: string}>;
            // TODO put entire entity update to "upsertIds" array ("gotTrashed" needed only for "message" updates)
            upsertIds: Array<{id: RestModel.Id; gotTrashed?: boolean}>;
        }>
        & {
            mails: {
                updatesArrayPropName: keyof Pick<RestModel.Event, "Messages">;
                updatesMappedByEntityId: Map<RestModel.Id, Array<Unpacked<Required<RestModel.Event>["Messages"]>>>;
            };
            folders: {
                updatesArrayPropName: keyof Pick<RestModel.Event, "Labels">;
                updatesMappedByEntityId: Map<RestModel.Id, Array<Unpacked<Required<RestModel.Event>["Labels"]>>>;
            };
            contacts: {
                updatesArrayPropName: keyof Pick<RestModel.Event, "Contacts">;
                updatesMappedByEntityId: Map<RestModel.Id, Array<Unpacked<Required<RestModel.Event>["Contacts"]>>>;
            };
        } = {
            mails: {
                updatesArrayPropName: "Messages",
                updatesMappedByEntityId: new Map(), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                remove: [],
                upsertIds: [],
            },
            folders: {
                updatesArrayPropName: "Labels",
                updatesMappedByEntityId: new Map(), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                remove: [],
                upsertIds: [],
            },
            contacts: {
                updatesArrayPropName: "Contacts",
                updatesMappedByEntityId: new Map(), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                remove: [],
                upsertIds: [],
            },
        };
    const entityTypes = Object.keys(mapping) as Array<keyof typeof mapping>;

    for (const event of input.events) {
        for (const entityType of entityTypes) {
            const {updatesArrayPropName, updatesMappedByEntityId} = mapping[entityType];

            for (const update of (event[updatesArrayPropName] ?? [])) {
                updatesMappedByEntityId.set(update.ID, [...(updatesMappedByEntityId.get(update.ID) ?? []), update]);
            }
        }
    }

    logger.verbose(
        [
            `resolved unique entities to process history chain:`,
            entityTypes.map((key) => `${key}: ${mapping[key].updatesMappedByEntityId.size}`).join("; "),
        ].join(" "),
    );

    for (const entityType of entityTypes) {
        const {updatesMappedByEntityId, upsertIds, remove} = mapping[entityType];

        for (const updates of updatesMappedByEntityId.values()) {
            // we take here just last update item as the most actual one
            const [update] = updates.slice().reverse(); // immutable reversing (assuming that entity updates sorted in ASC order)

            if (!update) {
                throw new Error("Failed to resolve the entity update item");
            }

            if (update.Action === RestModel.EVENT_ACTION.DELETE) {
                // "delete" action being placed at the tail is irrecoverable
                // so if it presents in the updates list then we don't process the list any longer
                remove.push({pk: Database.buildPk(update.ID)});
            } else {
                upsertIds.push({
                    id: update.ID,
                    gotTrashed: Boolean(update.Message?.LabelIDsAdded?.includes(SYSTEM_FOLDER_IDENTIFIERS.Trash)),
                });
            }
        }
    }

    const patch: DbPatch = {
        conversationEntries: {remove: [], upsert: []},
        mails: {remove: mapping.mails.remove, upsert: []},
        folders: {remove: mapping.folders.remove, upsert: []},
        contacts: {remove: mapping.contacts.remove, upsert: []},
    };

    if (!nullUpsert) {
        // TODO process 404 error of fetching individual entity ("message" case is handled, see "error.data.Code === 15052" check below)
        //      so we could catch the individual entity fetching error
        //      404 error can be ignored as if it occurs because user was moving the email from here to there ending up
        //      removing it while syncing cycle was in progress

        // fetching mails
        for (const {id, gotTrashed} of mapping.mails.upsertIds) {
            try {
                const response = await providerApi.message.getMessage(id);
                patch.mails.upsert.push(await Database.buildMail(response.Message, providerApi));
            } catch (error) {
                if (
                    gotTrashed
                    && isProtonApiError(error)
                    && ( // message has already been removed error condition:
                        error.status === 422
                        && error.data?.Code === 15052
                    )
                ) { // ignoring the error as permissible
                    // TODO figure how to suppress displaying this error on "proton ui" in the case we initiated it (triggered the fetching)
                    logger.warn(
                        // WARN don't log message-specific data as it might include sensitive fields
                        `skip message fetching as it has been already removed from the trash before fetch action started`,
                        // WARN don't log full error as it might include sensitive data
                        JSON.stringify(sanitizeProtonApiError(error)),
                    );
                } else {
                    throw error;
                }
            }
        }

        // fetching folders/labels
        if (mapping.folders.upsertIds.length) {
            const upsertIds = mapping.folders.upsertIds.map(({id}) => id);
            await (async () => {
                // TODO explore possibility to fetch folders by IDs ("upsertIds" variable)
                //      currently we fetch all of them and reduce the needed
                const [labelsResponse, foldersResponse] = await Promise.all([
                    providerApi.label.get(LABEL_TYPE.MESSAGE_LABEL),
                    providerApi.label.get(LABEL_TYPE.MESSAGE_FOLDER),
                ]);
                const allFoldersFromServer = [...labelsResponse.Labels, ...foldersResponse.Labels];
                const foldersToPush = allFoldersFromServer.filter(({ID}) => upsertIds.includes(ID)).map(Database.buildFolder);
                patch.folders.upsert.push(...foldersToPush);
            })();
        }

        // fetching contacts
        for (const {id} of mapping.contacts.upsertIds) {
            const contactResponse = await providerApi.contact.getContact(id);
            patch.contacts.upsert.push(Database.buildContact(contactResponse.Contact));
        }
    } else {
        // we only need the data structure to be formed at this point, so no need to perform the actual fetching
        for (const key of entityTypes) {
            mapping[key].upsertIds.forEach(() => {
                (patch[key].upsert as any[]) // eslint-disable-line @typescript-eslint/no-explicit-any
                    .push(null);
            });
        }
    }

    logger.verbose(
        [`upsert/remove:`, entityTypes.map((key) => `${key}: ${patch[key].upsert.length}/${patch[key].remove.length}`).join("; ")].join(
            " ",
        ),
    );

    return patch;
};
