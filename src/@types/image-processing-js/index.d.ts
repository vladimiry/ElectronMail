declare module "image-processing-js" {
    interface Container {
        data: Buffer;
        width: number;
        height: number;
    }

    const result: () => {
        modeBicubic: number;
        resampleImageFromBuffer: (source: Container, width: number, height: number, mode: number) => Container;
    };

    export = result;
}
