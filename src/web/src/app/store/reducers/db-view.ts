import {UnionOf} from "@vladimiry/unionize";
import {equals} from "ramda";

import * as fromRoot from "src/web/src/app/store/reducers/root";
import {DB_VIEW_ACTIONS} from "src/web/src/app/store/actions";
import {DbAccountPk, Mail, View} from "src/shared/model/database";
import {reduceNodesMails, walkConversationNodesTree} from "src/shared/util";

export const featureName = "db-view";

export interface Instance {
    folders: {
        system: View.Folder[];
        custom: View.Folder[];
    };
    foldersMeta: Record<View.Folder["pk"], {
        collapsibleNodes: Record<View.ConversationNode["entryPk"], boolean>;
        rootNodesCollapsed: Record<View.RootConversationNode["entryPk"], boolean>;
        mails: View.Mail[];
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
                DB_VIEW_ACTIONS.SelectFolder({dbAccountPk, folderPk: instance.selectedFolderPk, distinct: true}),
            );
        },
        SelectFolder: ({dbAccountPk, folderPk, distinct}) => {
            const key = instanceKey(dbAccountPk);
            const instance: Instance = {
                ...(state.instances[key] || initInstance()),
                selectedFolderPk: folderPk,
            };
            const folders = [...instance.folders.system, ...instance.folders.custom];

            if (instance.selectedFolderPk && !folders.some(({pk}) => instance.selectedFolderPk === pk)) {
                delete instance.selectedFolderPk;
            }

            const selectedFolder = folders.find(({pk}) => pk === instance.selectedFolderPk);
            const selectedMailPk = instance.selectedMail && instance.selectedMail.pk;
            let selectedMailExists: boolean = false;

            // TODO cleanup "instance.foldersMeta" (delete non existing folders)

            if (selectedFolder) {
                const {rootNodesCollapsed} = (instance.foldersMeta[selectedFolder.pk] || ({rootNodesCollapsed: {}}));
                const folderMeta: Instance["foldersMeta"][typeof selectedFolder.pk] = {
                    collapsibleNodes: {},
                    rootNodesCollapsed: {},
                    mails: reduceNodesMails(selectedFolder.rootConversationNodes, (mail) => mail.folders.includes(selectedFolder)),
                };

                for (const rootNode of selectedFolder.rootConversationNodes) {
                    let rootNodeCollapsible: boolean = false;

                    walkConversationNodesTree([rootNode], (node) => {
                        const mail = node.mail;
                        const nodeCollapsible = Boolean(mail && !mail.folders.includes(selectedFolder));

                        if (selectedMailPk && mail && mail.pk === selectedMailPk && !selectedMailExists) {
                            selectedMailExists = true;
                        }

                        if (nodeCollapsible) {
                            folderMeta.collapsibleNodes[node.entryPk] = true;
                        }

                        rootNodeCollapsible = rootNodeCollapsible || nodeCollapsible;
                    });

                    if (!rootNodeCollapsible) {
                        continue;
                    }

                    folderMeta.rootNodesCollapsed[rootNode.entryPk] = rootNode.entryPk in rootNodesCollapsed
                        ? rootNodesCollapsed[rootNode.entryPk] // preserve previously defined value
                        : true;
                }

                instance.foldersMeta[selectedFolder.pk] = folderMeta;
            }

            if (!selectedMailExists) {
                delete instance.selectedMail;
            }

            if (distinct && equals(state.instances[key], instance)) {
                return state;
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
        ToggleRootNodesCollapsing: ({dbAccountPk, entryPk}) => {
            const key = instanceKey(dbAccountPk);
            const instance = state.instances[key];
            const selectedFolderPk: string | undefined = instance && instance.selectedFolderPk || undefined;
            const folderMeta = selectedFolderPk && instance && instance.foldersMeta[selectedFolderPk];

            if (!selectedFolderPk || !instance || !folderMeta || !(entryPk in folderMeta.rootNodesCollapsed)) {
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
                                rootNodesCollapsed: {
                                    ...folderMeta.rootNodesCollapsed,
                                    [entryPk]: !folderMeta.rootNodesCollapsed[entryPk],
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
