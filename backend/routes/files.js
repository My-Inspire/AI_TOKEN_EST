/* =========================================================
   POST /api/files/parse — accepts multipart file upload OR
   JSON { filename, mime?, text?, size?, parseMeta?, modelId? }.
   Always responds 200 with a normalized result EXCEPT:
   413 file too large · 415 image/unsupported media (client
   OCR or vendor fallback handles those) · 400 bad request.
   Token math always runs server-side (estimate included).
   Successful content parses also return `ref` (a content-hash
   estimate reference): later calculate/compare/reports calls
   send the ref instead of re-uploading the extracted text.
   ========================================================= */

import { getModel } from "../services/modelService.js";
import { calculateInputTokens, estimateSizeTokens } from "../services/tokenService.js";
import { putText } from "../services/textCache.js";
import { FILE_ESTIMATION } from "../data/pricing.js";
import { env } from "../config/environment.js";
import { detectFormat } from "../parsers/common.js";
import { parseTxt } from "../parsers/txt.js";
import { parseCsv } from "../parsers/csv.js";
import { parseDocx } from "../parsers/docx.js";
import { parseXlsx } from "../parsers/xlsx.js";
import { parsePptx } from "../parsers/pptx.js";
import { parsePdf } from "../parsers/pdf.js";
import { parseImage } from "../parsers/ocr.js";
import { parseJson, parseXml } from "../parsers/common.js";

const NATIVE_PARSERS = {
    txt: (buffer, format) => parseTxt(buffer, format),
    csv: parseCsv,
    json: (buffer) => parseJson(buffer),
    xml: (buffer) => parseXml(buffer),
    docx: parseDocx,
    xlsx: parseXlsx,
    pptx: parsePptx,
    pdf: parsePdf
};

function tokensFor(result, { text, filename, size, model }) {
    if (!result || !result.success) {
        const tokens = estimateSizeTokens(size === null || size === undefined
            ? (filename ? { name: filename, size: 0 } : null)
            : { name: filename || "file", size });
        return { ...tokens, source: "file-size", parserFailed: true, parseError: result?.error || "File was not parsed." };
    }
    const fileEst = calculateInputTokens({
        prompt: "",
        fileText: text,
        fileMeta: filename ? { name: filename, size: size ?? text.length } : null,
        parseMeta: {
            success: true,
            format: result.format,
            source: result.source,
            characterCount: result.characterCount,
            wordCount: result.wordCount,
            pageCount: result.pageCount,
            imageWidth: result.imageWidth,
            imageHeight: result.imageHeight,
            warning: result.warning,
            error: null
        },
        model
    }).breakdown.file;
    return fileEst;
}

export async function handleFilesParse({ fields = {}, files = [] } = {}) {
    const modelId = fields.modelId || null;
    const model = modelId ? getModel(modelId) : null;

    // ---- JSON path: already-extracted text, size-only, or text blob ----
    if (files.length === 0) {
        const filename = typeof fields.filename === "string" ? fields.filename : "";
        if (!filename && typeof fields.text !== "string") {
            return { status: 400, json: { error: "Provide a multipart file or JSON { filename, text?, size? }." } };
        }
        if (typeof fields.text === "string") {
            const parseMeta = fields.parseMeta && typeof fields.parseMeta === "object" ? fields.parseMeta : null;
            const format = (parseMeta?.format || filename.split(".").pop() || "txt").toLowerCase();
            const result = {
                success: true,
                format,
                source: parseMeta?.source || "content",
                text: fields.text,
                characterCount: fields.text.length,
                wordCount: fields.text.split(/\s+/).filter(Boolean).length,
                pageCount: parseMeta?.pageCount ?? null,
                imageWidth: parseMeta?.imageWidth ?? null,
                imageHeight: parseMeta?.imageHeight ?? null,
                ocrText: parseMeta?.source === "ocr",
                warning: parseMeta?.warning || null,
                error: null
            };
            const tokens = tokensFor(result, {
                text: fields.text,
                filename,
                size: fields.size ?? fields.text.length,
                model
            });
            return { status: 200, json: { result, tokens, ref: putText(fields.text) } };
        }
        // size-only fallback estimate
        const size = Number(fields.size);
        if (!Number.isInteger(size) || size < 0) {
            return { status: 400, json: { error: "size must be a whole number ≥ 0." } };
        }
        return { status: 200, json: { result: null, tokens: estimateSizeTokens({ name: filename, size }), sizeOnly: true } };
    }

    // ---- multipart file path ----
    const file = files[0];
    const filename = file.filename || "upload";
    const maxBytes = (env.MAX_FILE_MB || FILE_ESTIMATION.maxFileSizeMB) * 1024 * 1024;
    if (file.buffer.length > maxBytes) {
        return { status: 413, json: { error: `File exceeds the ${env.MAX_FILE_MB || FILE_ESTIMATION.maxFileSizeMB} MB limit.` } };
    }

    const detection = detectFormat(filename, file.buffer);
    if (!detection.supported) {
        return { status: 415, json: { error: detection.reason, unsupported: true, format: detection.format } };
    }
    if (detection.format === "image") {
        const failed = parseImage();
        return { status: 415, json: { error: failed.error, unsupported: true, format: "image" } };
    }

    const parser = NATIVE_PARSERS[detection.format];
    if (!parser) {
        return { status: 415, json: { error: `No server parser for "${detection.format}".`, unsupported: true, format: detection.format } };
    }

    let result;
    try {
        result = parser(file.buffer, detection.format);
    } catch (error) {
        result = {
            success: false, format: detection.format, source: null, text: null,
            characterCount: null, wordCount: null, pageCount: null,
            imageWidth: null, imageHeight: null, ocrText: false,
            warning: null, error: error?.message || "Parser crashed unexpectedly."
        };
    }
    if (detection.reason) {
        result.warning = [result.warning, detection.reason].filter(Boolean).join(" ");
    }
    const tokens = tokensFor(result.success ? result : null, {
        text: result.text,
        filename,
        size: file.buffer.length,
        model
    });
    return { status: 200, json: { result, tokens, ref: result.success ? putText(result.text) : null } };
}
