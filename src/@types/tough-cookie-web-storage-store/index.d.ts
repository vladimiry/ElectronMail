declare module "tough-cookie-web-storage-store" {
    // <reference path="lib.dom.d" />

    import {Store} from "tough-cookie";

    class WebStorageCookieStore extends Store {
        public constructor(storage: Storage);
    }

    export = WebStorageCookieStore;
}
