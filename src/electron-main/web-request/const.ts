export const HEADERS = {
    request: {
        cookie: "Cookie",
        origin: "Origin",
        accessControlRequestHeaders: "Access-Control-Request-Headers",
        accessControlRequestMethod: "Access-Control-Request-Method",
        contentType: "Content-Type",
        userAgent: "User-Agent",
    },
    response: {
        accessControlAllowCredentials: "Access-Control-Allow-Credentials",
        accessControlAllowHeaders: "Access-Control-Allow-Headers",
        accessControlAllowMethods: "Access-Control-Allow-Methods",
        accessControlAllowOrigin: "Access-Control-Allow-Origin",
        accessControlExposeHeaders: "Access-Control-Expose-Headers",
    },
} as const;

export const STATIC_ALLOWED_ORIGINS = [
    "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai", // chromium built-in "PDF viewer" extension
    "https://fra-storage.protonmail.com", // proton-drive specific endpoint
    ...(
        BUILD_ENVIRONMENT === "development"
            ? ["devtools://devtools"]
            : []
    ),
] as const;
