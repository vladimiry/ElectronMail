import * as DatabaseModel from "src/shared/model/database";
import * as Rest from "src/electron-preload/webview/tutanota/lib/rest";
import {buildBaseEntity, buildPk} from ".";

export function buildConversationEntry(input: Rest.Model.ConversationEntry): DatabaseModel.ConversationEntry {
    return {
        ...buildBaseEntity(input),
        conversationType: DatabaseModel.CONVERSATION_TYPE._.parseValue(input.conversationType),
        messageId: input.messageId,
        mailPk: input.mail ? buildPk(input.mail) : undefined,
        previousPk: input.previous ? buildPk(input.previous) : undefined,
    };
}
