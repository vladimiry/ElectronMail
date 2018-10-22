import {UnionOf} from "@vladimiry/unionize";

import * as fromRoot from "src/web/src/app/store/reducers/root";
import {DB_VIEW_ACTIONS} from "src/web/src/app/store/actions";
import {DbAccountPk, Mail, View} from "src/shared/model/database";
import {walkConversationNodesTree} from "src/shared/util";

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
            const matchesSelectedMailByPk = ((selectedMailPk) => {
                return selectedMailPk
                    ? ({pk}: View.Mail) => pk === selectedMailPk
                    : () => false;
            })(instance.selectedMail && instance.selectedMail.pk);
            let keepSelectedMail: boolean = false;

            // TODO delete non existing folders from "instance.foldersMeta"

            if (selectedFolder) {
                // TODO consider caching this block calculations result, so no recalculation on repeatable same folder selection
                // TODO consider initializing "foldersMeta" at the backend side once before serving the response
                const folderMeta: Instance["foldersMeta"][typeof selectedFolder.pk] = {
                    collapsibleNodes: {},
                    rootNodesCollapsed: {},
                    mails: [],
                };
                const {rootNodesCollapsed} = (instance.foldersMeta[selectedFolder.pk] || ({rootNodesCollapsed: {}}));

                for (const rootNode of selectedFolder.rootConversationNodes) {
                    const collapsibleNodes: typeof folderMeta.collapsibleNodes = {};

                    walkConversationNodesTree([rootNode], ({mail, entryPk}) => {
                        if (!mail) {
                            return;
                        }

                        keepSelectedMail = keepSelectedMail || matchesSelectedMailByPk(mail);

                        if (mail.folders.includes(selectedFolder)) {
                            folderMeta.mails.push(mail);
                        } else {
                            collapsibleNodes[entryPk] = true;
                        }
                    });

                    folderMeta.collapsibleNodes = {
                        ...folderMeta.collapsibleNodes,
                        ...collapsibleNodes,
                    };

                    if (!Object.keys(collapsibleNodes).length) {
                        continue;
                    }

                    folderMeta.rootNodesCollapsed[rootNode.entryPk] = rootNode.entryPk in rootNodesCollapsed
                        ? rootNodesCollapsed[rootNode.entryPk] // preserve previously defined value
                        : true;
                }

                instance.foldersMeta[selectedFolder.pk] = folderMeta;
            } else {
                delete instance.selectedFolderPk;
            }

            if (!keepSelectedMail) {
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
