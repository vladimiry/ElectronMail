import * as Rest from "./rest";
import {Unpacked} from "src/shared/types";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {curryFunctionMembers} from "src/shared/util";

// TODO consider executing direct $http calls
// in order to not depend on Protonmail WebClient's AngularJS factories/services
export interface Api {
    $http: ng.IHttpService;
    url: {
        build: (module: string) => () => string;
    };
    messageModel: (message: Rest.Model.Message) => {
        clearTextBody: () => Promise<string>;
    };
    conversation: {
        get: (id: Rest.Model.Conversation["ID"]) => Promise<{ data: Rest.Model.ConversationResponse }>;
        query: (
            params?: Rest.Model.QueryParams & { LabelID?: Unpacked<Rest.Model.Conversation["LabelIDs"]> },
        ) => Promise<{ data: Rest.Model.ConversationsResponse }>;
    };
    message: {
        get: (id: Rest.Model.Message["ID"]) => Promise<{ data: Rest.Model.MessageResponse }>;
        query: (
            params?: Rest.Model.QueryParams & { LabelID?: Unpacked<Rest.Model.Message["LabelIDs"]> },
        ) => Promise<Rest.Model.MessagesResponse>;
    };
    contact: {
        get: (id: Rest.Model.Contact["ID"]) => Promise<Rest.Model.ContactResponse["Contact"]>;
        all: () => Promise<Rest.Model.ContactsResponse["Contacts"]>;
    };
    label: {
        query: (params?: { Type?: Rest.Model.Label["Type"] }) => Promise<Rest.Model.LabelsResponse["Labels"]>;
    };
    events: {
        get: (id: Rest.Model.Event["EventID"], config?: ng.IRequestShortcutConfig) => Promise<Rest.Model.EventResponse>;
        getLatestID: () => Promise<Rest.Model.LatestEventResponse>;
    };
    vcard: {
        // TODO proper "vcard" model definition
        from: (vcfString: string) => { version: string; data: Record<string, any> };
    };
}

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.protonmail, "[lib/api]");
const state: { api?: Promise<Api> } = {};

export async function resolveApi(): Promise<Api> {
    if (state.api) {
        return state.api;
    }

    return state.api = (async () => {
        const angular: angular.IAngularStatic | undefined = (window as any).angular;
        const injector = angular && angular.element(document.body).injector();

        if (!injector) {
            throw new Error(`Failed to resolve "injector" variable`);
        }

        await injectorGet<{ app: () => Promise<void> }>(injector, "lazyLoader").app();

        // TODO validate types of all the described constants/functions in a declarative way
        // so app gets protonmail breaking changes noticed on early stage

        return {
            $http: injectorGet<Api["$http"]>(injector, "$http"),
            url: injectorGet<Api["url"]>(injector, "url"),
            messageModel: injectorGet<Api["messageModel"]>(injector, "messageModel"),
            conversation: injectorGet<Api["conversation"]>(injector, "conversationApi"),
            message: injectorGet<Api["message"]>(injector, "messageApi"),
            contact: injectorGet<Api["contact"]>(injector, "Contact"),
            label: injectorGet<Api["label"]>(injector, "Label"),
            events: injectorGet<Api["events"]>(injector, "Events"),
            vcard: injectorGet<Api["vcard"]>(injector, "vcard"),
        };
    })();
}

function injectorGet<T>(injector: ng.auto.IInjectorService, name: string): T {
    logger.info(`injectorGet()`);
    const result = injector.get<T | undefined>(name);

    if (!result) {
        throw new Error(`Failed to resolve "${name}" service`);
    }

    logger.verbose(`injectorGet()`, `"${name}" keys`, JSON.stringify(Object.keys(result)));

    return result;
}
