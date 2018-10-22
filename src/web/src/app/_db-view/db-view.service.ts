import {Injectable} from "@angular/core";

import {View} from "src/shared/model/database";
import {walkConversationNodesTree} from "src/shared/util";

@Injectable()
export class DbViewService {
    calculateFolderSummary(folder: View.Folder): { size: number; unread: number; } {
        const result: ReturnType<typeof DbViewService.prototype.calculateFolderSummary> = {size: 0, unread: 0};

        walkConversationNodesTree(folder.rootConversationNodes, ({mail}) => {
            if (!mail || !mail.folders.includes(folder)) {
                return;
            }

            result.size++;
            result.unread += Number(mail.unread);
        });

        return result;
    }
}
