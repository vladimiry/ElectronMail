import {Context} from "src/electron-main/model";
import {ReadonlyDeep} from "type-fest";
import {upgradeConfig} from "src/electron-main/storage-upgrade";

export async function upgradeExistingConfig(ctx: ReadonlyDeep<Context>) {
    const existingConfig = await ctx.configStore.read();

    if (
        existingConfig
        &&
        upgradeConfig(existingConfig) // got mutated
    ) {
        await ctx.configStore.write(existingConfig); // write mutated config
    }
}
