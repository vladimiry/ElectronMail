declare module "tough-cookie-web-storage-store" {
    // <reference path="lib.dom.d" />

    import {Store} from "tough-cookie";

    class WebStorageCookieStore extends Store {
        public constructor(storage: WindowSessionStorage["sessionStorage"] & WindowLocalStorage["localStorage"]);
    }

    export = WebStorageCookieStore;
}
