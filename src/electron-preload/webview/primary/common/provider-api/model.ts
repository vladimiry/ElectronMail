import {AddInitializedProp, DefineObservableValue} from "src/electron-preload/webview/primary/lib/provider-api/model";
import {WEBVIEW_PRIMARY_INTERNALS_KEYS} from "./const";
import {PROVIDER_REPO_MAP, PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS} from "src/shared/const/proton-apps";

export type Keys = StrictExclude<
    | (typeof PROVIDER_REPO_MAP)["proton-mail"]["protonPack"]["webpackIndexEntryItems"][number]
    | (typeof PROVIDER_REPO_MAP)["proton-calendar"]["protonPack"]["webpackIndexEntryItems"][number]
    | (typeof PROVIDER_REPO_MAP)["proton-drive"]["protonPack"]["webpackIndexEntryItems"][number],
    typeof PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS[number]
>;

export type LazyKeys = never;

export type ImmediateKeys = StrictExclude<Keys, LazyKeys>;

// TODO clone the proton project on npm postinstall hook and reference the modules signatures from their typescript code
//      like: typeof import("output/git/proton-calendar/src/app/content/PrivateApp.tsx")
export type ProviderInternals = AddInitializedProp<
    & {
        [K in StrictExtract<ImmediateKeys, typeof WEBVIEW_PRIMARY_INTERNALS_KEYS["proton-mail"]["key"]>]: DefineObservableValue<
            {readonly privateScope: unknown},
            (arg: unknown) => import("react").ReactNode
        >;
    }
    & {
        [K in StrictExtract<ImmediateKeys, typeof WEBVIEW_PRIMARY_INTERNALS_KEYS["proton-calendar"]["key"]>]: DefineObservableValue<
            {readonly privateScope: unknown},
            (arg: unknown) => import("react").ReactNode
        >;
    }
    & {
        [K in StrictExtract<ImmediateKeys, typeof WEBVIEW_PRIMARY_INTERNALS_KEYS["proton-drive"]["key"]>]: DefineObservableValue<
            {readonly privateScope: unknown},
            (arg: unknown) => import("react").ReactNode
        >;
    }
>;

export type ProviderApi = DeepReadonly<{_custom_: {loggedIn$: import("rxjs").Observable<boolean>}}>;
