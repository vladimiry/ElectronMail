import {UnionOf} from "@vladimiry/unionize";
import {pick} from "ramda";

import * as fromRoot from "src/web/src/app/store/reducers/root";
import {DB_VIEW_ACTIONS} from "src/web/src/app/store/actions";
import {DbAccountPk, Mail, View} from "src/shared/model/database";
import {mailDateComparatorDefaultsToDesc, walkConversationNodesTree} from "src/shared/util";

export const featureName = "db-view";

export interface MailSorter {
    title: string;
    prop: keyof View.Mail;
    desc?: boolean;
}

export interface MailsBundle {
    title: string;
    items: Array<{ mail: View.Mail; conversationSize: number; }>;
    sorters: MailSorter[];
    sorterIndex: number;
    paging: { page: number; end: number; nextPageSize: number; pageSize: number; };
}

export type MailsBundleKey = keyof Pick<Instance, "folderMailsBundle" | "folderConversationsBundle" | "searchMailsBundle">;

export interface Instance {
    folders: {
        system: View.Folder[];
        custom: View.Folder[];
    };
    selectedFolderData?: Pick<View.Folder, "pk" | "mailFolderId">;
    folderMailsBundle: MailsBundle;
    folderConversationsBundle: MailsBundle;
    searchMailsBundle: MailsBundle;
    selectedMail?: {
        listMailPk: Mail["pk"];
        rootNode: View.RootConversationNode;
        conversationMail: Mail;
    };
}

export interface State extends fromRoot.State {
    instances: Partial<Record<string, Instance>>;
}

const initialState: State = {
    instances: {},
};

// TODO use "immer"
// TODO optimize and simplify "db-view" reducer
export function reducer(state = initialState, action: UnionOf<typeof DB_VIEW_ACTIONS>): State {
    return DB_VIEW_ACTIONS.match(action, {
        SetFolders: ({dbAccountPk, folders}) => {
            const instanceKey = resolveInstanceKey(dbAccountPk);
            const instance: Instance = {
                ...(state.instances[instanceKey] || initInstance()),
                folders,
            };
            const searchMailsBundleItemsRemoved: boolean = (() => {
                const bundleKey = "searchMailsBundle";

                if (!instance[bundleKey].items.length) {
                    return false;
                }

                const allMailPks = new Set<View.Mail["pk"]>();

                [...instance.folders.system, ...instance.folders.custom].forEach((folder) => {
                    walkConversationNodesTree(folder.rootConversationNodes, ({mail}) => {
                        if (mail) {
                            allMailPks.add(mail.pk);
                        }
                    });
                });

                const nonexistentItems = instance[bundleKey].items.filter(({mail}) => !allMailPks.has(mail.pk));

                if (nonexistentItems.length) {
                    instance[bundleKey] = {
                        ...instance[bundleKey],
                        items: instance[bundleKey].items.filter((item) => !nonexistentItems.includes(item)),
                    };
                    return true;
                }

                return false;
            })();

            const result = reducer(
                {
                    ...state,
                    instances: {
                        ...state.instances,
                        [instanceKey]: instance,
                    },
                },
                DB_VIEW_ACTIONS.SelectFolder({dbAccountPk, selectedFolderData: instance.selectedFolderData}),
            );

            return searchMailsBundleItemsRemoved
                ? reducer(
                    result,
                    DB_VIEW_ACTIONS.Paging({dbAccountPk, mailsBundleKey: "searchMailsBundle", noIncrement: true}),
                )
                : result;
        },
        SelectFolder: ({dbAccountPk, selectedFolderData}) => {
            const instanceKey = resolveInstanceKey(dbAccountPk);
            const instance: Instance = {
                ...(state.instances[instanceKey] || initInstance()),
                selectedFolderData: selectedFolderData
                    ? pick(["pk", "mailFolderId"], selectedFolderData)
                    : selectedFolderData,
            };
            const selectedFolder = [...instance.folders.system, ...instance.folders.custom]
                .find(({pk}) => pk === (instance.selectedFolderData && instance.selectedFolderData.pk));

            if (selectedFolder) {
                // TODO consider caching this block calculations result, so no recalculation on repeatable same folder selection
                // TODO consider initializing "selectedFolderMails" at the backend side once before serving the response
                const items: Record<Extract<MailsBundleKey, "folderMailsBundle" | "folderConversationsBundle">, MailsBundle["items"]> = {
                    folderMailsBundle: [],
                    folderConversationsBundle: [],
                };
                const allSelectedFolderMailPks = new Set<View.Mail["pk"]>();

                for (const rootNode of selectedFolder.rootConversationNodes) {
                    const allNodeMails: View.Mail[] = [];
                    const matchedNodeMails: View.Mail[] = [];

                    walkConversationNodesTree([rootNode], ({mail}) => {
                        if (!mail) {
                            return;
                        }

                        allSelectedFolderMailPks.add(mail.pk);
                        allNodeMails.push(mail);

                        if (mail.folders.includes(selectedFolder)) {
                            matchedNodeMails.push(mail);
                        }
                    });

                    if (!matchedNodeMails.length) {
                        continue;
                    }

                    const conversationSize = allNodeMails.length;

                    items.folderMailsBundle.push(
                        ...matchedNodeMails.map((mail) => ({
                            mail,
                            conversationSize,
                        })),
                    );
                    items.folderConversationsBundle.push({
                        mail: [...matchedNodeMails].sort(mailDateComparatorDefaultsToDesc)[0],
                        conversationSize,
                    });
                }

                Object.entries(items).forEach(([key, value]) => {
                    const mailsBundleKey = key as keyof typeof items;

                    instance[mailsBundleKey] = {
                        ...instance[mailsBundleKey],
                        items: value,
                    };

                    sortMails(instance[mailsBundleKey]);
                });

                const {selectedMail} = instance;

                if (
                    selectedMail
                    &&
                    !allSelectedFolderMailPks.has(selectedMail.conversationMail.pk)
                ) {
                    delete instance.selectedMail;
                }
            } else {
                delete instance.selectedFolderData;
                delete instance.selectedMail;
            }

            let result = {
                ...state,
                instances: {
                    ...state.instances,
                    [instanceKey]: instance,
                },
            };

            result = reducer(
                result,
                DB_VIEW_ACTIONS.Paging({dbAccountPk, mailsBundleKey: "folderMailsBundle", noIncrement: true}),
            );
            result = reducer(
                result,
                DB_VIEW_ACTIONS.Paging({dbAccountPk, mailsBundleKey: "folderConversationsBundle", noIncrement: true}),
            );

            return result;
        },
        FullTextSearch: ({dbAccountPk, value: {uid, mailsBundleItems}}) => {
            const mailsBundleKey = "searchMailsBundle";
            const instanceKey = resolveInstanceKey(dbAccountPk);
            const instance: Instance = {
                ...(state.instances[instanceKey] || initInstance()),
            };

            instance[mailsBundleKey] = {
                ...instance[mailsBundleKey],
                items: mailsBundleItems,
            };

            sortMails(instance[mailsBundleKey]);

            delete instance.selectedMail;

            return reducer(
                {
                    ...state,
                    instances: {
                        ...state.instances,
                        [instanceKey]: instance,
                    },
                },
                DB_VIEW_ACTIONS.Paging({dbAccountPk, mailsBundleKey, reset: true}),
            );
        },
        ResetSearchMailsBundleItems: ({dbAccountPk}) => {
            const mailsBundleKey = "searchMailsBundle";
            const instanceKey = resolveInstanceKey(dbAccountPk);
            const instance: Instance = {
                ...(state.instances[instanceKey] || initInstance()),
            };

            instance[mailsBundleKey].items = [];

            return reducer(
                {
                    ...state,
                    instances: {
                        ...state.instances,
                        [instanceKey]: instance,
                    },
                },
                DB_VIEW_ACTIONS.Paging({dbAccountPk, mailsBundleKey, reset: true}),
            );
        },
        SortMails: ({dbAccountPk, mailsBundleKey, sorterIndex}) => {
            const instanceKey = resolveInstanceKey(dbAccountPk);
            const instance: Instance = {
                ...(state.instances[instanceKey] || initInstance()),
            };
            instance[mailsBundleKey] = {
                ...instance[mailsBundleKey],
                sorterIndex,
            };

            sortMails(instance[mailsBundleKey]);

            return {
                ...state,
                instances: {
                    ...state.instances,
                    [instanceKey]: instance,
                },
            };
        },
        Paging: ({dbAccountPk, mailsBundleKey, reset, noIncrement}) => {
            const instanceKey = resolveInstanceKey(dbAccountPk);
            const instance: Instance = {
                ...(state.instances[instanceKey] || initInstance()),
            };
            const {items, paging} = instance[mailsBundleKey] = {
                ...instance[mailsBundleKey],
                paging: reset
                    ? initMailBundlePaging()
                    : {...instance[mailsBundleKey].paging},
            };
            const size = items.length;
            const maxPage = Math.ceil(size / paging.pageSize);

            paging.page = Math.min(paging.page + (Number(!noIncrement)), maxPage);
            paging.end = Math.min((paging.page * paging.pageSize) || paging.pageSize, size);
            paging.nextPageSize = Math.min(size - paging.end, paging.pageSize);

            return {
                ...state,
                instances: {
                    ...state.instances,
                    [instanceKey]: instance,
                },
            };
        },
        SelectMail: ({dbAccountPk, value: selectedMail}) => {
            const instanceKey = resolveInstanceKey(dbAccountPk);
            const instance: Instance = {
                ...(state.instances[instanceKey] || initInstance()),
                selectedMail,
            };

            return {
                ...state,
                instances: {
                    ...state.instances,
                    [instanceKey]: instance,
                },
            };
        },
        SelectConversationMail: ({dbAccountPk, conversationMail}) => {
            const instanceKey = resolveInstanceKey(dbAccountPk);
            const instance = state.instances[instanceKey] || initInstance();

            if (!instance.selectedMail) {
                throw new Error(`Failed to resolve "selectedMail" for patching "conversationMail" value`);
            }

            return {
                ...state,
                instances: {
                    ...state.instances,
                    [instanceKey]: {
                        ...instance,
                        selectedMail: {
                            ...instance.selectedMail,
                            conversationMail,
                        },
                    },
                },
            };
        },
        UnmountInstance: ({dbAccountPk}) => {
            const instanceKey = resolveInstanceKey(dbAccountPk);
            const instances = {...state.instances};

            delete instances[instanceKey];

            return {
                ...state,
                instances,
            };
        },
        default: () => state,
    });
}

function sortMails<MailExt extends object>(mailsBundle: MailsBundle) {
    const {prop, desc} = mailsBundle.sorters[mailsBundle.sorterIndex];

    mailsBundle.items.sort(
        desc
            ? (o1, o2) => Number(o2.mail[prop]) - Number(o1.mail[prop])
            : (o1, o2) => Number(o1.mail[prop]) - Number(o2.mail[prop]),
    );
}

function resolveInstanceKey(dbAccountPk: DbAccountPk): string {
    return JSON.stringify(dbAccountPk);
}

function initInstance(): Instance {
    const common = () => ({
        items: [],
        sorterIndex: 0,
        paging: initMailBundlePaging(),
    });

    return {
        folders: {
            system: [],
            custom: [],
        },
        folderMailsBundle: {
            ...common(),
            title: "folder mails",
            sorters: initMailBundleSorters(),
        },
        folderConversationsBundle: {
            ...common(),
            title: "folder conversations",
            sorters: initMailBundleSorters(),
        },
        searchMailsBundle: {
            ...common(),
            title: "found mails",
            sorters: [
                {
                    title: "Score (Desc)",
                    prop: "score" as keyof View.Mail, // TS get rid of casting
                    desc: true,
                },
                {
                    title: "Score (Asc)",
                    prop: "score" as keyof View.Mail, // TS get rid of casting
                },
                ...initMailBundleSorters(),
            ],
        },
    };
}

function initMailBundlePaging(): MailsBundle["paging"] {
    return {page: 0, end: 0, nextPageSize: 0, pageSize: 50};
}

function initMailBundleSorters(): MailSorter[] {
    return [
        {
            title: "Date (Desc)",
            prop: "sentDate",
            desc: true,
        },
        {
            title: "Date (Asc)",
            prop: "sentDate",
        },
    ];
}
