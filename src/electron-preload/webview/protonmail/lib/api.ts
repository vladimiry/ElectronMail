import * as Rest from "./rest";
import {Unpacked} from "src/shared/types";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {curryFunctionMembers} from "src/shared/util";

const _logger = curryFunctionMembers(WEBVIEW_LOGGERS.protonmail, "[lib/api]");

interface Api {
    conversation: {
        get: (
            id: Rest.Model.Conversation["ID"],
        ) => Promise<Rest.Model.ConversationResponse>;
        query: (
            params?: Rest.Model.QueryParams & {
                LabelID: Unpacked<Rest.Model.Conversation["LabelIDs"]>;
            },
        ) => Promise<Rest.Model.ConversationsResponse>;
    };
}

const state: { api?: Promise<Api> } = {};

export async function resolveApi(): Promise<Api> {
    const logger = curryFunctionMembers(_logger, "resolveApi()");
    logger.info();

    if (state.api) {
        return state.api;
    }

    return state.api = (async () => {
        const angular: angular.IAngularStatic | undefined = (window as any).angular;

        if (!angular) {
            throw new Error(`Failed to resolve "window.angular" library`);
        }

        const $injector = angular.element(document.body).injector();
        const lazyLoader: { app: () => Promise<void> } = $injector.get("lazyLoader");
        logger.verbose(`"lazyLoader" keys`, JSON.stringify(lazyLoader && Object.keys(lazyLoader)));

        await lazyLoader.app();

        const conversation: Api["conversation"] = $injector.get("conversationApi");
        logger.verbose(`"conversation" keys`, JSON.stringify(conversation && Object.keys(conversation)));

        // TODO validate types of all the described constants/functions in a declarative way
        // so app gets protonmail breaking changes noticed on early stage

        return {
            conversation,
        };
    })();
}
