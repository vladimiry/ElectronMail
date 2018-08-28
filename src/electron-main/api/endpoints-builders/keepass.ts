import {KeePassHttpClient, Model as KeePassHttpClientModel} from "keepasshttp-client";
import {from} from "rxjs";

import {Context} from "src/electron-main/model";
import {Endpoints} from "src/shared/api/main";
import {MessageFieldContainer} from "src/shared/model/container";

export async function buildEndpoints(
    ctx: Context,
): Promise<Pick<Endpoints, "associateSettingsWithKeePass" | "keePassRecordRequest">> {
    return {
        associateSettingsWithKeePass: ({url}) => from((async () => {
            const client = new KeePassHttpClient({url});

            try {
                await client.associate();
            } catch (error) {
                handleKeePassRequestError(error);
            }

            return ctx.settingsStore.write({
                ...(await ctx.settingsStore.readExisting()),
                keePassClientConf: {url: client.url, keyId: {id: client.id, key: client.key}},
            });
        })()),

        keePassRecordRequest: ({keePassClientConf, keePassRef, suppressErrors}) => from((async () => {
            const client = new KeePassHttpClient(keePassClientConf);
            let response;

            try {
                await client.testAssociate();
                response = await client.getLogins({url: keePassRef.url});
            } catch (error) {
                return handleKeePassRequestError(error, suppressErrors);
            }

            if (response.Entries) {
                for (const entry of response.Entries) {
                    if (entry && entry.Uuid === keePassRef.uuid) {
                        return {password: entry.Password};
                    }
                }
            }

            return {message: `Password is not found`};
        })()),
    };
}

function handleKeePassRequestError(error: any, suppressErrors = false): MessageFieldContainer {
    if (error instanceof KeePassHttpClientModel.Common.NetworkResponseStatusCodeError && error.statusCode === 503) {
        if (suppressErrors) {
            return {message: "Locked"};
        }
        error.message = "KeePass: Locked";
    }
    if (error instanceof KeePassHttpClientModel.Common.NetworkConnectionError) {
        if (suppressErrors) {
            return {message: "No connection"};
        }
        error.message = "KeePass: No connection";
    }
    if (error instanceof KeePassHttpClientModel.Common.NetworkResponseContentError) {
        if (suppressErrors) {
            return {message: "Invalid response"};
        }
        error.message = "KeePass: Invalid response";
    }
    if (suppressErrors) {
        return {message: "Request failed"};
    }
    throw error;
}
