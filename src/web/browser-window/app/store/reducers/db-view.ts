import {UnionOf} from "@vladimiry/unionize";
import {pick} from "remeda";

import * as fromRoot from "src/web/browser-window/app/store/reducers/root";
import {DB_VIEW_ACTIONS, NAVIGATION_ACTIONS} from "src/web/browser-window/app/store/actions";
import {Mail, View} from "src/shared/model/database";
import {WebAccountPk} from "src/web/browser-window/app/model";
import {mailDateComparatorDefaultsToDesc, walkConversationNodesTree} from "src/shared/util";

export const featureName = "db-view";

export type MailSorter = NoExtraProps<{
    title: string;
    prop: keyof Required<View.Mail>;
    desc?: boolean;
}>;

export type MailsBundle = NoExtraProps<{
    title: string;
    items: Array<{ mail: View.Mail; conversationSize: number }>;
    sorters: MailSorter[];
    sorterIndex: number;
    paging: NoExtraProps<{ page: number; end: number; nextPageSize: number; pageSize: number }>;
}>

export type MailsBundleKey = keyof Pick<Instance,
    | "folderMailsBundle"
    | "folderConversationsBundle"
    | "searchMailsBundle"
    | "searchNoQueryMailsBundle">;

export type SearchMailsBundleKey = Extract<MailsBundleKey, "searchMailsBundle" | "searchNoQueryMailsBundle">;

export type Instance = NoExtraProps<{
    folders: NoExtraProps<{
        system: View.Folder[];
        custom: View.Folder[];
    }>;
    selectedFolderData?: Pick<View.Folder, "id">;
    folderMailsBundle: MailsBundle;
    folderConversationsBundle: MailsBundle;
    searchMailsBundle: MailsBundle;
    searchNoQueryMailsBundle: MailsBundle;
    searchResultMailsBundleKey?: SearchMailsBundleKey;
    selectedMail?: NoExtraProps<{
        listMailPk: Mail["pk"];
        rootNode: View.RootConversationNode;
        conversationMail: Mail;
    }>;
}>;

export interface State extends fromRoot.State {
    instances: Partial<Record<string, Instance>>;
}

const initialState: State = {
    instances: {},
};

function sortMails(mailsBundle: MailsBundle): void {
    const sorter = mailsBundle.sorters[mailsBundle.sorterIndex];

    if (!sorter) {
        throw new Error("Sorter resolving failed");
    }

    const {prop, desc} = sorter;

    mailsBundle.items.sort(
        desc
            ? (o1, o2) => Number(o2.mail[prop]) - Number(o1.mail[prop])
            : (o1, o2) => Number(o1.mail[prop]) - Number(o2.mail[prop]),
    );
}

function resolveInstanceKey(webAccountPk: WebAccountPk): string {
    return JSON.stringify(webAccountPk);
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

function initInstance(): NoExtraProps<Instance> {
    const common = (): NoExtraProps<Pick<MailsBundle, "items" | "sorterIndex" | "paging">> => {
        return {
            items: [],
            sorterIndex: 0,
            paging: initMailBundlePaging(),
        };
    };

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
                    prop: "score",
                    desc: true,
                },
                {
                    title: "Score (Asc)",
                    prop: "score",
                },
                ...initMailBundleSorters(),
            ],
        },
        searchNoQueryMailsBundle: {
            ...common(),
            title: "found mails",
            sorters: initMailBundleSorters(),
        },
    };
}

// TODO use "immer"
// TODO optimize and simplify "db-view" reducer
function innerReducer(state = initialState, action: UnionOf<typeof DB_VIEW_ACTIONS>): State {
    return DB_VIEW_ACTIONS.match(action, {
        SetFolders: ({webAccountPk, folders}) => {
            const instanceKey = resolveInstanceKey(webAccountPk);
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

            const result = innerReducer(
                {
                    ...state,
                    instances: {
                        ...state.instances,
                        [instanceKey]: instance,
                    },
                },
                DB_VIEW_ACTIONS.SelectFolder({webAccountPk, selectedFolderData: instance.selectedFolderData}),
            );

            return searchMailsBundleItemsRemoved
                ? innerReducer(
                    result,
                    DB_VIEW_ACTIONS.Paging({webAccountPk, mailsBundleKey: "searchMailsBundle", noIncrement: true}),
                )
                : result;
        },
        SelectFolder: ({webAccountPk, selectedFolderData}) => {
            const instanceKey = resolveInstanceKey(webAccountPk);
            const instance: Instance = {
                ...(state.instances[instanceKey] || initInstance()),
                selectedFolderData: selectedFolderData
                    ? pick(selectedFolderData, ["id"])
                    : selectedFolderData,
            };
            const selectedFolder = [...instance.folders.system, ...instance.folders.custom]
                .find(({id}) => id === (instance.selectedFolderData && instance.selectedFolderData.id));

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

                    {
                        const [conversationMail] = [...matchedNodeMails].sort(mailDateComparatorDefaultsToDesc);

                        if (!conversationMail) {
                            throw new Error("Failed to resolve conversation mail");
                        }

                        items.folderConversationsBundle.push({
                            mail: conversationMail,
                            conversationSize,
                        });
                    }
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

            result = innerReducer(
                result,
                DB_VIEW_ACTIONS.Paging({webAccountPk, mailsBundleKey: "folderMailsBundle", noIncrement: true}),
            );
            result = innerReducer(
                result,
                DB_VIEW_ACTIONS.Paging({webAccountPk, mailsBundleKey: "folderConversationsBundle", noIncrement: true}),
            );

            return result;
        },
        FullTextSearch: ({webAccountPk, value: {mailsBundleItems, searched}}) => {
            const keys = ["searchMailsBundle", "searchNoQueryMailsBundle"] as const;
            const [searchResultMailsBundleKey, mailsBundleKeyToEmpty] = searched
                ? keys
                : [...keys].reverse();
            const instanceKey = resolveInstanceKey(webAccountPk);
            const instance: Instance = {
                ...(state.instances[instanceKey] || initInstance()),
            };

            instance.searchResultMailsBundleKey = searchResultMailsBundleKey;

            instance[searchResultMailsBundleKey] = {
                ...instance[searchResultMailsBundleKey],
                items: mailsBundleItems,
            };

            sortMails(instance[searchResultMailsBundleKey]);

            delete instance.selectedMail;

            return innerReducer(
                innerReducer(
                    {
                        ...state,
                        instances: {
                            ...state.instances,
                            [instanceKey]: instance,
                        },
                    },
                    DB_VIEW_ACTIONS.Paging({webAccountPk, mailsBundleKey: searchResultMailsBundleKey, reset: true}),
                ),
                DB_VIEW_ACTIONS.ResetSearchMailsBundleItems({webAccountPk, mailsBundleKey: mailsBundleKeyToEmpty}),
            );
        },
        ResetSearchMailsBundleItems: ({webAccountPk, mailsBundleKey}) => {
            const instanceKey = resolveInstanceKey(webAccountPk);
            const instance: Instance = {
                ...(state.instances[instanceKey] || initInstance()),
            };

            instance[mailsBundleKey].items = [];

            return innerReducer(
                {
                    ...state,
                    instances: {
                        ...state.instances,
                        [instanceKey]: instance,
                    },
                },
                DB_VIEW_ACTIONS.Paging({webAccountPk, mailsBundleKey, reset: true}),
            );
        },
        SortMails: ({webAccountPk, mailsBundleKey, sorterIndex}) => {
            const instanceKey = resolveInstanceKey(webAccountPk);
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
        Paging: ({webAccountPk, mailsBundleKey, reset, noIncrement}) => {
            const instanceKey = resolveInstanceKey(webAccountPk);
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
        SelectMail: ({webAccountPk, value: selectedMail}) => {
            const instanceKey = resolveInstanceKey(webAccountPk);
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
        SelectConversationMail: ({webAccountPk, conversationMail}) => {
            const instanceKey = resolveInstanceKey(webAccountPk);
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
        UnmountInstance: ({webAccountPk}) => {
            const instanceKey = resolveInstanceKey(webAccountPk);
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

export function reducer(state = initialState, action: UnionOf<typeof DB_VIEW_ACTIONS> & UnionOf<typeof NAVIGATION_ACTIONS>): State {
    if (NAVIGATION_ACTIONS.is.Logout(action)) {
        return initialState;
    }

    return innerReducer(state, action);
}
