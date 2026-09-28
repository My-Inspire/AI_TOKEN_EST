/* =========================================================
   OCR/images: server-side OCR needs traineddata models and
   native/WASM runtimes (no offline dependency allowed), so
   this endpoint-side parser is intentionally unimplemented:
   images are processed by the bundled client Tesseract path,
   which is preserved and working. This module exists so the
   boundary is explicit — never a silent fake result.
   ========================================================= */

import { failResult } from "./common.js";

export const OCR_UNAVAILABLE = "OCR is only available through the in-browser engine (bundled Tesseract). Upload images in the app; text is extracted locally.";

export function parseImage() {
    return {
        ...failResult("image", OCR_UNAVAILABLE),
        unsupported: true
    };
}
