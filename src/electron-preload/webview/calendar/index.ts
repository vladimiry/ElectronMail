import {configureProviderApp} from "./configure-provider-app";
import {registerApi} from "./api";

bootstrap();

function bootstrap() {
    configureProviderApp();
    registerApi();
}
