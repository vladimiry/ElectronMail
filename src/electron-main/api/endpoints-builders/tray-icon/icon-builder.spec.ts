import test from "ava";

import {IMAGE_PROCESSOR} from "./icon-builder";

test("dependency:image-processing-js", (t) => {
    t.is("object", typeof IMAGE_PROCESSOR);
    t.is("function", typeof IMAGE_PROCESSOR.resampleImageFromBuffer);
    t.is("number", typeof IMAGE_PROCESSOR.modeBicubic);
    t.is(2, IMAGE_PROCESSOR.modeBicubic);
});
