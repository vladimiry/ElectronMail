import {AddInitializedProp, DefineObservableValue} from "src/electron-preload/webview/lib/provider-api/model";
import {PROVIDER_REPO_MAP, PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS} from "src/shared/const/proton-apps";

export type Keys = StrictExclude<(typeof PROVIDER_REPO_MAP)["proton-calendar"]["protonPack"]["webpackIndexEntryItems"][number],
    typeof PROVIDER_REPO_STANDARD_SETUP_WEBPACK_INDEX_ENTRY_ITEMS[number]>

export type LazyKeys = never;

export type ImmediateKeys = StrictExclude<Keys, LazyKeys>

// TODO clone the proton project on npm postinstall hook and reference the modules signatures from their typescript code
//      like: typeof import("output/git/proton-calendar/src/app/content/PrivateApp.tsx")
export type ProviderInternals = AddInitializedProp<{
    [K in StrictExtract<ImmediateKeys, "./src/app/content/PrivateApp.tsx">]: DefineObservableValue<{
        readonly privateScope: unknown
    }, (arg: unknown) => import("react").ReactNode>
}>

export type ProviderApi = DeepReadonly<{
    _custom_: {
        loggedIn$: import("rxjs").Observable<boolean>
    }
}>
