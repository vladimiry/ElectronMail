import {Action} from "@ngrx/store";

export class UpdateOverlayIcon implements Action {
    static readonly type = "account:update-overlay-icon";
    readonly type = UpdateOverlayIcon.type;

    public dataURL?: string;

    constructor(public count: number) {
        if (count) {
            this.dataURL = createOverlayIconDataURL(count);
        }
    }
}

function createOverlayIconDataURL(messageCount: number) {
    const canvas = document.createElement("canvas");

    canvas.height = 128;
    canvas.width = 128;
    canvas.style.letterSpacing = "-5px";

    const ctx = canvas.getContext("2d");

    if (!ctx) {
        throw new Error("Failed to get 2d canvas context");
    }

    ctx.fillStyle = "#DC3545";
    ctx.beginPath();
    ctx.ellipse(64, 64, 64, 64, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "white";
    ctx.font = "90px sans-serif";
    ctx.fillText(String(Math.min(99, messageCount)), 64, 96);

    return canvas.toDataURL();
}
