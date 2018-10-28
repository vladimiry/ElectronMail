import {UnionOf} from "@vladimiry/unionize";

import * as fromRoot from "src/web/src/app/store/reducers/root";
import {DB_VIEW_ACTIONS} from "src/web/src/app/store/actions";
import {DbAccountPk, Mail, View} from "src/shared/model/database";
import {sortMails, walkConversationNodesTree} from "src/shared/util";

export const featureName = "db-view";

export interface Instance {
    folders: {
        system: View.Folder[];
        custom: View.Folder[];
    };
    foldersMeta: Record<View.Folder["pk"], {
        mails: View.Mail[];
        matchedMailsCount: Record<View.RootConversationNode["entryPk"], number>;
        expanded: Record<View.RootConversationNode["entryPk"], boolean>;
        unmatchedNodes: Record<View.ConversationNode["entryPk"], boolean>;
        unmatchedNodesCollapsed: Record<View.RootConversationNode["entryPk"], boolean>;
        mostRecentMatchedMails: Record<View.RootConversationNode["entryPk"], View.Mail>;
    }>;
    selectedFolderPk?: View.Folder["pk"];
    selectedMail?: Mail;
}

export interface State extends fromRoot.State {
    instances: Partial<Record<string, Instance>>;
}

const initialState: State = {
    instances: {},
};

// TODO optimize and simplify "db-view" reducer
export function reducer(state = initialState, action: UnionOf<typeof DB_VIEW_ACTIONS>): State {
    return DB_VIEW_ACTIONS.match(action, {
        SetFolders: ({dbAccountPk, folders}) => {
            const key = instanceKey(dbAccountPk);
            const instance: Instance = {
                ...(state.instances[key] || initInstance()),
                folders,
            };

            return reducer(
                {
                    ...state,
                    instances: {
                        ...state.instances,
                        [key]: instance,
                    },
                },
                DB_VIEW_ACTIONS.SelectFolder({dbAccountPk, folderPk: instance.selectedFolderPk}),
            );
        },
        SelectFolder: ({dbAccountPk, folderPk}) => {
            const key = instanceKey(dbAccountPk);
            const instance: Instance = {
                ...(state.instances[key] || initInstance()),
                selectedFolderPk: folderPk,
            };
            const selectedFolder = instance.folders.system.concat(instance.folders.custom)
                .find(({pk}) => pk === instance.selectedFolderPk);

            // TODO delete non existing folders from "instance.foldersMeta"

            if (selectedFolder) {
                // TODO consider caching this block calculations result, so no recalculation on repeatable same folder selection
                // TODO consider initializing "foldersMeta" at the backend side once before serving the response
                const folderMeta: Instance["foldersMeta"][typeof selectedFolder.pk] = {
                    mails: [],
                    matchedMailsCount: {},
                    expanded: (instance.foldersMeta[selectedFolder.pk] || ({expanded: {}})).expanded,
                    unmatchedNodes: {},
                    unmatchedNodesCollapsed: {},
                    mostRecentMatchedMails: {},
                };
                const {unmatchedNodesCollapsed} = (instance.foldersMeta[selectedFolder.pk] || ({unmatchedNodesCollapsed: {}}));
                const selectedMailPk = instance.selectedMail && instance.selectedMail.pk;

                for (const rootNode of selectedFolder.rootConversationNodes) {
                    const matchedMails: typeof folderMeta.mails = [];
                    const unmatchedNodes: typeof folderMeta.unmatchedNodes = {};

                    walkConversationNodesTree([rootNode], ({mail, entryPk}) => {
                        if (!mail) {
                            return;
                        }

                        if (mail.folders.includes(selectedFolder)) {
                            matchedMails.push(mail);
                        } else {
                            unmatchedNodes[entryPk] = true;
                        }
                    });

                    // matched mails handling
                    folderMeta.mails.push(...matchedMails);
                    folderMeta.matchedMailsCount[rootNode.entryPk] = matchedMails.length;
                    folderMeta.mostRecentMatchedMails[rootNode.entryPk] = sortMails(matchedMails)[0];

                    // unmatched mails handling
                    folderMeta.unmatchedNodes = {
                        ...folderMeta.unmatchedNodes,
                        ...unmatchedNodes,
                    };
                    if (!Object.keys(unmatchedNodes).length) {
                        delete folderMeta.unmatchedNodesCollapsed[rootNode.entryPk];
                        continue;
                    }
                    folderMeta.unmatchedNodesCollapsed[rootNode.entryPk] = rootNode.entryPk in unmatchedNodesCollapsed
                        ? unmatchedNodesCollapsed[rootNode.entryPk] // preserve previously defined value
                        : true;
                }

                // conversations need to be sorted based on the matched mails, backend returns it sorted by all the mails
                selectedFolder.rootConversationNodes.sort((o1, o2) => {
                    return folderMeta.mostRecentMatchedMails[o2.entryPk].sentDate - folderMeta.mostRecentMatchedMails[o1.entryPk].sentDate;
                });

                folderMeta.mails = sortMails(folderMeta.mails);
                instance.foldersMeta[selectedFolder.pk] = folderMeta;

                if (selectedMailPk && !folderMeta.mails.find(({pk}) => pk === selectedMailPk)) {
                    delete instance.selectedMail;
                }
            } else {
                delete instance.selectedFolderPk;
                delete instance.selectedMail;
            }

            return {
                ...state,
                instances: {
                    ...state.instances,
                    [key]: instance,
                },
            };
        },
        SelectMail: ({dbAccountPk, mail}) => {
            const key = instanceKey(dbAccountPk);
            const instance: Instance = {
                ...(state.instances[key] || initInstance()),
                selectedMail: mail,
            };

            return {
                ...state,
                instances: {
                    ...state.instances,
                    [key]: instance,
                },
            };
        },
        ToggleFolderMetadataProp: ({dbAccountPk, prop, entryPk}) => {
            const key = instanceKey(dbAccountPk);
            const instance = state.instances[key];
            const selectedFolderPk: string | undefined = instance && instance.selectedFolderPk || undefined;
            const folderMeta = selectedFolderPk && instance && instance.foldersMeta[selectedFolderPk];

            if (!selectedFolderPk || !instance || !folderMeta/* || !(entryPk in folderMeta[prop])*/) {
                return state;
            }

            return {
                ...state,
                instances: {
                    ...state.instances,
                    [key]: {
                        ...instance,
                        foldersMeta: {
                            ...instance.foldersMeta,
                            [selectedFolderPk]: {
                                ...folderMeta,
                                [prop]: {
                                    ...folderMeta[prop],
                                    [entryPk]: !folderMeta[prop][entryPk],
                                },
                            },
                        },
                    },
                },
            };
        },
        UnmountInstance: ({dbAccountPk}) => {
            const instances = {...state.instances};

            delete instances[instanceKey(dbAccountPk)];

            return {
                ...state,
                instances,
            };
        },
        default: () => state,
    });
}

function instanceKey(dbAccountPk: DbAccountPk): string {
    return JSON.stringify(dbAccountPk);
}

function initInstance(): Instance {
    return {
        folders: {
            system: [],
            custom: [],
        },
        foldersMeta: {},
    };
}
