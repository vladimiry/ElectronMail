import {UnionOf} from "unionize";

import * as fromRoot from "src/web/src/app/store/reducers/root";
import {DB_VIEW_ACTIONS} from "src/web/src/app/store/actions";
import {DbEntitiesRecordContainer, FolderWithMailsReference as Folder, MAIL_FOLDER_TYPE} from "src/shared/model/database";

export const featureName = "db-view";

export interface Instance {
    data: {
        folders: Folder[];
        contacts: DbEntitiesRecordContainer["contacts"];
    };
    filters: {
        selectedFolderPk?: Folder["pk"];
    };
}

export interface State extends fromRoot.State {
    instances: Partial<Record<string, Instance>>;
}

const initialState: State = {
    instances: {},
};

export function reducer(state = initialState, action: UnionOf<typeof DB_VIEW_ACTIONS>): State {
    return DB_VIEW_ACTIONS.match(action, {
        PatchInstanceData: ({dbAccountPk, patch}) => {
            const key = JSON.stringify(dbAccountPk);
            const instance = {...(state.instances[key] || buildInstance())};

            instance.data = {...instance.data, ...patch};

            const {folders} = instance.data;
            const {filters} = instance;

            if (!folders.length) {
                delete filters.selectedFolderPk;
            } else {
                if (filters.selectedFolderPk && !folders.some(({pk}) => filters.selectedFolderPk === pk)) {
                    delete filters.selectedFolderPk;
                }
                if (!filters.selectedFolderPk) {
                    filters.selectedFolderPk = (folders.find(({folderType}) => folderType === MAIL_FOLDER_TYPE.INBOX) || folders[0]).pk;
                }
            }

            return {
                ...state,
                instances: {
                    ...state.instances,
                    [key]: instance,
                },
            };
        },
        PatchInstanceFilters: ({dbAccountPk, patch}) => {
            const key = JSON.stringify(dbAccountPk);
            const instance = {...(state.instances[key] || buildInstance())};

            instance.filters = {...instance.filters, ...patch};

            return {
                ...state,
                instances: {
                    ...state.instances,
                    [key]: instance,
                },
            };
        },
        UnmountInstance: ({dbAccountPk}) => {
            const instances = {...state.instances};

            delete instances[JSON.stringify(dbAccountPk)];

            return {
                ...state,
                instances,
            };
        },
        default: () => state,
    });
}

function buildInstance(): Instance {
    return {
        data: {
            folders: [],
            contacts: {},
        },
        filters: {
            selectedFolderPk: undefined,
        },
    };
}
