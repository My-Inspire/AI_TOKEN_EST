/* =========================================================
   Shared parser plumbing: result shapes, word counts,
   extension + magic-byte format detection.
   ========================================================= */

export function wordCountOf(text) {
    if (!text) return 0;
    return String(text).split(/\s+/).filter(Boolean).length;
}

export function okResult(format, source, text, extra = {}) {
    return {
        success: true,
        format,
        source,
        text,
        characterCount: text ? text.length : 0,
        wordCount: wordCountOf(text),
        pageCount: extra.pageCount || null,
        imageWidth: extra.imageWidth || null,
        imageHeight: extra.imageHeight || null,
        ocrText: extra.ocrText || false,
        warning: extra.warning || null,
        error: null
    };
}

export function failResult(format, error, warning = null) {
    return {
        success: false,
        format,
        source: null,
        text: null,
        characterCount: null,
        wordCount: null,
        pageCount: null,
        imageWidth: null,
        imageHeight: null,
        ocrText: false,
        warning,
        error: String(error?.message || error || "Unknown parser error")
    };
}

export function getExtension(filename) {
    const name = filename || "";
    const dot = name.lastIndexOf(".");
    if (dot < 0) return "";
    return name.slice(dot + 1).toLowerCase();
}

/* Magic-byte sniffing for distinctive signatures. */
export function sniffSignature(buffer) {
    const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
    if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
    if (b.length >= 2 && b[0] === 0x50 && b[1] === 0x4B) return "zip";
    if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return "png";
    if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "jpg";
    if (b.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
    return null;
}

const EXTENSION_FORMATS = {
    pdf: "pdf", docx: "docx", txt: "txt", md: "txt",
    xlsx: "xlsx", csv: "csv", pptx: "pptx",
    png: "image", jpg: "image", jpeg: "image", webp: "image",
    json: "json", xml: "xml"
};

/* JSON: deterministic serialization for estimation. */
export function parseJson(buffer) {
    const raw = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer ?? "");
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        return failResult("json", `Invalid JSON: ${error.message}`);
    }
    const text = JSON.stringify(parsed, null, 1) ?? raw;
    return okResult("json", "content", typeof text === "string" ? text : raw);
}

/* XML: text-node extraction (regex-based, no DOM dependency). */
export function parseXml(buffer) {
    const raw = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer ?? "");
    const withoutComments = raw.replace(/<!--[\s\S]*?-->/g, " ").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
    if (!/<([a-zA-Z_][\w:.-]*)(\s[^>]*)?>/.test(withoutComments)) {
        return failResult("xml", "Malformed XML document.");
    }
    const chunks = withoutComments
        .replace(/<[^>]+>/g, " ")
        .split(/\s+/)
        .map((s) => s.replace(/&(lt|gt|amp|quot|apos);/g, (_, e) =>
            ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[e]))
        .filter(Boolean);
    const text = chunks.join(" ");
    if (!text) return failResult("xml", "XML contained no text content.");
    return okResult("xml", "content", text);
}

/* detectFormat(filename, buffer) → { format, supported, reason } */
export function detectFormat(filename, buffer) {
    const ext = getExtension(filename);
    /* JPEG spells two ways — treat them as one for signature comparison. */
    const normExt = ext === "jpeg" ? "jpg" : ext;
    const sniffed = sniffSignature(buffer);
    if (sniffed === "zip" && ["xlsx", "pptx", "docx"].includes(ext)) {
        return { format: ext, supported: true, reason: null };
    }
    if (sniffed && ["pdf", "png", "jpg", "webp"].includes(sniffed) && sniffed !== normExt) {
        return {
            format: sniffed,
            supported: true,
            reason: `Extension ".${ext}" did not match the actual ${sniffed.toUpperCase()} content; parsed by file signature.`
        };
    }
    if (EXTENSION_FORMATS[ext]) {
        const format = EXTENSION_FORMATS[ext];
        return { format, supported: true, reason: null };
    }
    return { format: ext || "unknown", supported: false, reason: `".${ext || "unknown"}" is not a supported format.` };
}
