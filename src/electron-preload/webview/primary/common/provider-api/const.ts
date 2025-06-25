export const WEBVIEW_PRIMARY_INTERNALS_APP_TYPES = ["proton-mail", "proton-calendar", "proton-drive"] as const;

export const WEBVIEW_PRIMARY_INTERNALS_KEYS = {
    [WEBVIEW_PRIMARY_INTERNALS_APP_TYPES[0]]: {
        key: "./src/app/components/layout/PrivateLayout.tsx",
        handleObservableValue: {itemName: "PrivateLayout", itemCallResultTypeValidation: "object"},
    },
    [WEBVIEW_PRIMARY_INTERNALS_APP_TYPES[1]]: {
        key: "./src/app/containers/calendar/MainContainer.tsx",
        handleObservableValue: {itemName: "WrappedMainContainer", itemCallResultTypeValidation: "object"},
    },
    [WEBVIEW_PRIMARY_INTERNALS_APP_TYPES[2]]: {
        key: "./src/app/containers/MainContainer.tsx",
        handleObservableValue: {itemName: "MainContainer", itemCallResultTypeValidation: "object"},
    },
} as const;
