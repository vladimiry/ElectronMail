// TODO remove taken from @types/keytar declaration on https://github.com/atom/node-keytar/pull/67 resolving
declare module "keytar-prebuild" {
    // tslint:disable:max-line-length

    // Type definitions for keytar 4.0.2
    // Project: http://atom.github.io/node-keytar/
    // Definitions by: Milan Burda <https://github.com/miniak>, Brendan Forster <https://github.com/shiftkey>, Hari Juturu <https://github.com/juturu>
    // Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

    /**
     * Get the stored password for the service and account.
     *
     * @param service The string service name.
     * @param account The string account name.
     *
     * @returns A promise for the password string.
     */
    function getPassword(service: string, account: string): Promise<string | null>;

    /**
     * Add the password for the service and account to the keychain.
     *
     * @param service The string service name.
     * @param account The string account name.
     * @param password The string password.
     *
     * @returns A promise for the set password completion.
     */
    function setPassword(service: string, account: string, password: string): Promise<void>;

    /**
     * Delete the stored password for the service and account.
     *
     * @param service The string service name.
     * @param account The string account name.
     *
     * @returns A promise for the deletion status. True on success.
     */
    function deletePassword(service: string, account: string): Promise<boolean>;

    /**
     * Find a password for the service in the keychain.
     *
     * @param service The string service name.
     *
     * @returns A promise for the password string.
     */
    function findPassword(service: string): Promise<string | null>;
}
