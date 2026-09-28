/* Plain text + Markdown (read as UTF-8 text). */

import { okResult, failResult } from "./common.js";

export function parseTxt(buffer, format = "txt") {
    try {
        const text = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer ?? "");
        return okResult(format, "content", text);
    } catch (error) {
        return failResult(format, error);
    }
}
