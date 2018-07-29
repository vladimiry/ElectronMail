declare module "image-processing-js" {
    interface Container {
        data: Buffer;
        width: number;
        height: number;
    }

    const modeNearestNeighbour: number;
    const modeBilinear: number;
    const modeBicubic: number;

    function resampleImageFromBuffer(source: Container, width: number, height: number, mode: number): Container;
}
