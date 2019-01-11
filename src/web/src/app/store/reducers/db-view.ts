import {UnionOf} from "@vladimiry/unionize";

import * as fromRoot from "src/web/src/app/store/reducers/root";
import {DB_VIEW_ACTIONS} from "src/web/src/app/store/actions";
import {DbAccountPk, Mail, View} from "src/shared/model/database";
import {mailDateComparatorDefaultsToDesc, walkConversationNodesTree} from "src/shared/util";

export const featureName = "db-view";

export interface Instance {
    folders: {
        system: View.Folder[];
        custom: View.Folder[];
    };
    selectedFolderMails: Record<View.Folder["pk"], {
        mailsView: Array<{ mail: View.Mail; conversationSize: number; }>;
        conversationsView: Array<{ mail: View.Mail; conversationSize: number; }>;
    }>;
    selectedFolderPk?: View.Folder["pk"];
    selectedMailData?: {
        listMailPk: Mail["pk"];
        rootNode: View.RootConversationNode;
        rootNodeMail: Mail;
    };
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
            const key = resolveInstanceKey(dbAccountPk);
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
            const key = resolveInstanceKey(dbAccountPk);
            const instance: Instance = {
                ...(state.instances[key] || initInstance()),
                selectedFolderPk: folderPk,
            };
            const selectedFolder = instance.folders.system.concat(instance.folders.custom)
                .find(({pk}) => pk === instance.selectedFolderPk);

            // TODO delete non existing folders from "instance.selectedFolderMails"

            if (selectedFolder) {
                // TODO consider caching this block calculations result, so no recalculation on repeatable same folder selection
                // TODO consider initializing "selectedFolderMails" at the backend side once before serving the response
                const {
                    mailsView,
                    conversationsView,
                }: Instance["selectedFolderMails"][typeof selectedFolder.pk] = instance.selectedFolderMails[selectedFolder.pk] = {
                    mailsView: [],
                    conversationsView: [],
                };
                const allMailsPks: Array<View.Mail["pk"]> = [];

                for (const rootNode of selectedFolder.rootConversationNodes) {
                    const allNodeMails: View.Mail[] = [];
                    const matchedNodeMails: View.Mail[] = [];

                    walkConversationNodesTree([rootNode], ({mail}) => {
                        if (!mail) {
                            return;
                        }

                        allMailsPks.push(mail.pk);
                        allNodeMails.push(mail);

                        if (mail.folders.includes(selectedFolder)) {
                            matchedNodeMails.push(mail);
                        }
                    });

                    if (!matchedNodeMails.length) {
                        continue;
                    }

                    const conversationSize = allNodeMails.length;

                    mailsView.push(
                        ...matchedNodeMails.map((mail) => ({
                            mail,
                            conversationSize,
                        })),
                    );

                    conversationsView.push({
                        mail: [...matchedNodeMails].sort(mailDateComparatorDefaultsToDesc)[0],
                        conversationSize,
                    });
                }

                [mailsView, conversationsView].forEach((array) => {
                    array.sort((o1, o2) => mailDateComparatorDefaultsToDesc(o1.mail, o2.mail));
                });

                const {selectedMailData} = instance;

                if (
                    selectedMailData
                    &&
                    (
                        !conversationsView.find(({mail: {pk}}) => pk === selectedMailData.listMailPk)
                        ||
                        !allMailsPks.includes(selectedMailData.rootNodeMail.pk)
                    )
                ) {
                    delete instance.selectedMailData;
                }
            } else {
                delete instance.selectedFolderPk;
                delete instance.selectedMailData;
            }

            return {
                ...state,
                instances: {
                    ...state.instances,
                    [key]: instance,
                },
            };
        },
        SelectListMailToDisplay: ({dbAccountPk, listMailPk, rootNode, rootNodeMail}) => {
            const key = resolveInstanceKey(dbAccountPk);
            const instance: Instance = {
                ...(state.instances[key] || initInstance()),
                selectedMailData: {listMailPk, rootNode, rootNodeMail},
            };

            return {
                ...state,
                instances: {
                    ...state.instances,
                    [key]: instance,
                },
            };
        },
        SelectRootNodeMailToDisplay: ({dbAccountPk, rootNodeMail}) => {
            const instanceKey = resolveInstanceKey(dbAccountPk);
            const currentInstance = state.instances[instanceKey] || initInstance();

            if (!currentInstance.selectedMailData) {
                throw new Error(`Failed to resolve "selectedMailData" for patching "rootNodeMail" value`);
            }

            const instance: Instance = {
                ...currentInstance,
                selectedMailData: {
                    ...currentInstance.selectedMailData,
                    rootNodeMail,
                },
            };

            return {
                ...state,
                instances: {
                    ...state.instances,
                    [instanceKey]: instance,
                },
            };
        },
        UnmountInstance: ({dbAccountPk}) => {
            const instances = {...state.instances};

            delete instances[resolveInstanceKey(dbAccountPk)];

            return {
                ...state,
                instances,
            };
        },
        default: () => state,
    });
}

function resolveInstanceKey(dbAccountPk: DbAccountPk): string {
    return JSON.stringify(dbAccountPk);
}

function initInstance(): Instance {
    return {
        folders: {
            system: [],
            custom: [],
        },
        selectedFolderMails: {},
    };
}
