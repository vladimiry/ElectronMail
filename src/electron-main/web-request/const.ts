export const HEADERS = {
    request: {
        origin: "Origin",
        accessControlRequestHeaders: "Access-Control-Request-Headers",
        accessControlRequestMethod: "Access-Control-Request-Method",
        contentType: "Content-Type",
    },
    response: {
        accessControlAllowCredentials: "Access-Control-Allow-Credentials",
        accessControlAllowHeaders: "Access-Control-Allow-Headers",
        accessControlAllowMethods: "Access-Control-Allow-Methods",
        accessControlAllowOrigin: "Access-Control-Allow-Origin",
        accessControlExposeHeaders: "Access-Control-Expose-Headers",
    },
} as const;
