// TODO switch to the "@types/sodium-native" as soon as it gets released
declare module "sodium-native" {
    // tslint:disable:variable-name

    const crypto_pwhash_ALG_DEFAULT: number;
    const crypto_pwhash_MEMLIMIT_MIN: number;
    const crypto_pwhash_MEMLIMIT_MAX: number;
    const crypto_pwhash_MEMLIMIT_INTERACTIVE: number;
    const crypto_pwhash_MEMLIMIT_MODERATE: number;
    const crypto_pwhash_MEMLIMIT_SENSITIVE: number;
    const crypto_pwhash_OPSLIMIT_MIN: number;
    const crypto_pwhash_OPSLIMIT_MAX: number;
    const crypto_pwhash_OPSLIMIT_INTERACTIVE: number;
    const crypto_pwhash_OPSLIMIT_MODERATE: number;
    const crypto_pwhash_OPSLIMIT_SENSITIVE: number;
    const crypto_secretbox_MACBYTES: number;
    const crypto_secretbox_NONCEBYTES: number;
    const crypto_secretbox_KEYBYTES: number;

    // tslint:enable:variable-name

    function crypto_pwhash_async(
        key: Buffer,
        password: Buffer,
        salt: Buffer,
        opsLimit: number,
        memLimit: number,
        algorithm: number,
    ): Promise<void>;

    function crypto_secretbox_easy(
        cipher: Buffer,
        message: Buffer,
        nonce: Buffer,
        key: Buffer,
    ): void;

    function crypto_secretbox_open_easy(
        message: Buffer,
        cipher: Buffer,
        nonce: Buffer,
        key: Buffer,
    ): boolean;

    function randombytes_buf(
        input: Buffer,
    ): void;
}
