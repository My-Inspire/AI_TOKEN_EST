/* =========================================================
   Token estimation (authoritative). Source-tracked estimates:
   exact | extracted | ocr | image | heuristic | file-size.
   Operates on plain data ({name,size} meta + parsed result) —
   no browser File dependency.
   ========================================================= */

import { ESTIMATION_CONFIG, FILE_ESTIMATION, IMAGE_ESTIMATION } from "../data/pricing.js";
import { countTextTokens, TOKENIZER_VERSION } from "./tokenizerService.js";
import { getText } from "./textCache.js";

export const ESTIMATION_SOURCE = {
    EXACT: "exact",
    EXTRACTED: "extracted",
    OCR: "ocr",
    IMAGE: "image",
    HEURISTIC: "heuristic",
    FILE_SIZE: "file-size",
    MIXED: "mixed",
    UNKNOWN: "unknown"
};

function getCharsPerToken(providerId, modelType = "chat") {
    const byProvider = ESTIMATION_CONFIG.byProvider ?? {};
    const byType = ESTIMATION_CONFIG.byModelType ?? {};
    const defaultCPT = ESTIMATION_CONFIG.defaultCharsPerToken ?? 4;
    return byProvider[providerId] ?? byType[modelType] ?? defaultCPT;
}

export function estimateTextTokens(text, model) {
    if (!text || !text.trim()) {
        return { tokens: 0, source: ESTIMATION_SOURCE.EXACT, method: "empty", chars: 0 };
    }
    const provider = model?.provider || "custom";
    const modelType = model?.type || "chat";
    /* Preferred path: pretoken + per-provider calibration. Never throws
       (returns null) — legacy chars-per-token math below is the fallback
       so a tokenizer bug can never zero-out or crash an estimate. */
    const counted = countTextTokens(text, { provider, modelType });
    if (counted) {
        const effective = Number.isFinite(counted.effectiveCharsPerToken) && counted.effectiveCharsPerToken > 0
            ? Math.round(counted.effectiveCharsPerToken * 100) / 100
            : getCharsPerToken(provider, modelType);
        return {
            tokens: counted.tokens,
            source: ESTIMATION_SOURCE.HEURISTIC,
            method: `provider-calibrated estimate v${TOKENIZER_VERSION} (${counted.family}, ${counted.pretokens} pretokens)`,
            chars: counted.chars,
            charsPerToken: effective,
            tokenizer: counted.family,
            tokenizerVersion: counted.version,
            pretokens: counted.pretokens
        };
    }
    const chars = text.trim().length;
    const charsPerToken = getCharsPerToken(provider, modelType);
    const tokens = Math.ceil(chars / charsPerToken);
    return {
        tokens,
        source: ESTIMATION_SOURCE.HEURISTIC,
        method: `char-heuristic-fallback (${charsPerToken} chars/token)`,
        chars,
        charsPerToken
    };
}

function getBytesPerToken(ext) {
    const table = FILE_ESTIMATION.bytesPerToken ?? {};
    return table[ext] ?? table.default ?? 6;
}

export function estimateSizeTokens(fileMeta) {
    if (!fileMeta) {
        return { tokens: 0, source: ESTIMATION_SOURCE.EXACT, method: "no-file" };
    }
    const ext = String(fileMeta.name || "").split(".").pop()?.toLowerCase() || "default";
    const bytesPerToken = getBytesPerToken(ext);
    const tokens = Math.ceil(Number(fileMeta.size || 0) / bytesPerToken);
    return {
        tokens,
        source: ESTIMATION_SOURCE.FILE_SIZE,
        method: `file-size (${bytesPerToken} bytes/token, .${ext})`,
        fileSize: Number(fileMeta.size || 0),
        fileType: ext,
        bytesPerToken,
        note: "File content not extracted — estimate based on file size only."
    };
}

/* Approximate multimodal image tokens (tile-based, labelled). */
export function estimateImageTokens(width, height) {
    const cfg = IMAGE_ESTIMATION;
    if (!width || !height) {
        return { tokens: cfg.baseTokens, approximated: true, note: cfg.note + " Dimensions unavailable; base estimate used." };
    }
    let w = width, h = height;
    const long = Math.max(w, h);
    if (long > cfg.maxLongEdge) {
        const s = cfg.maxLongEdge / long;
        w = Math.round(w * s); h = Math.round(h * s);
    }
    const short = Math.min(w, h);
    if (short > 768) {
        const s = 768 / short;
        w = Math.round(w * s); h = Math.round(h * s);
    }
    const tiles = Math.max(1, Math.ceil(w / cfg.tileSize) * Math.ceil(h / cfg.tileSize));
    return {
        tokens: cfg.baseTokens + tiles * cfg.perTileTokens,
        approximated: true,
        tiles,
        scaledWidth: w,
        scaledHeight: h,
        note: cfg.note
    };
}

/* Combine prompt + file(s) into input tokens.
   fileText/fileMeta/parseMeta: legacy single-file payload (or null).
   files: optional array of { fileText, fileMeta, parseMeta } — when
   non-empty, per-file estimates are summed exactly (no rounding drift
   from concatenating texts; images and size-fallbacks keep their own
   math). Never silently size-fallbacks — failures are labelled. */
export function calculateInputTokens({ prompt = "", fileText = null, fileMeta = null, parseMeta = null, files = null, model = null }) {
    const promptEst = estimateTextTokens(prompt, model);
    if (Array.isArray(files) && files.length > 0) {
        const perFile = files.map((f) => {
            const est = estimateFileTokens({
                fileText: f?.fileText ?? null,
                fileRef: f?.fileRef ?? null,
                fileMeta: f?.fileMeta ?? null,
                parseMeta: f?.parseMeta ?? null,
                model
            });
            return { ...est, name: f?.fileMeta?.name ?? null };
        });
        const fileTokens = perFile.reduce((sum, e) => sum + (e.tokens || 0), 0);
        const sources = new Set(perFile.map((e) => e.source));
        const allExact = sources.size === 1 && sources.has(ESTIMATION_SOURCE.EXACT);
        /* Single file keeps the exact legacy aggregate shape (meta fields
           intact) so lone-file responses are byte-identical to before. */
        const aggregate = files.length === 1
            ? { ...perFile[0], fileCount: 1 }
            : {
                tokens: fileTokens,
                source: allExact ? ESTIMATION_SOURCE.EXACT : (sources.size === 1 ? perFile[0].source : ESTIMATION_SOURCE.MIXED),
                method: `${files.length} files combined`,
                fileCount: files.length,
                extractedChars: perFile.reduce((sum, e) => sum + (e.extractedChars || 0), 0) || null
            };
        return {
            tokens: promptEst.tokens + fileTokens,
            breakdown: { prompt: promptEst, file: aggregate, files: perFile },
            source: allExact && !prompt?.trim() ? promptEst.source : aggregate.source,
            method: `prompt + ${files.length} file${files.length === 1 ? "" : "s"}`
        };
    }
    const fileEst = estimateFileTokens({ fileText, fileMeta, parseMeta, model });
    return {
        tokens: promptEst.tokens + fileEst.tokens,
        breakdown: { prompt: promptEst, file: fileEst },
        source: fileMeta || fileText ? fileEst.source : promptEst.source,
        method: "prompt + file"
    };
}

function estimateFileTokens({ fileText, fileRef = null, fileMeta, parseMeta, model }) {
    /* Estimate references avoid re-uploading parsed text: resolve the
       cached text, preferring inline text when both are present. */
    let text = fileText;
    let refExpired = false;
    if ((text === null || text === undefined) && fileRef) {
        text = getText(fileRef);
        if (text === null || text === undefined) refExpired = true;
    }
    if (!fileMeta && (text === null || text === undefined) && !fileRef) {
        return { tokens: 0, source: ESTIMATION_SOURCE.EXACT, method: "no-file" };
    }
    const ext = fileMeta ? String(fileMeta.name || "").split(".").pop()?.toLowerCase() || "default" : "default";
    const sizeFallback = () => {
        const est = estimateSizeTokens(fileMeta);
        return {
            ...est,
            source: ESTIMATION_SOURCE.FILE_SIZE,
            parserFailed: true,
            parseError: parseMeta?.error || "File was not parsed.",
            note: `Content extraction failed${parseMeta?.error ? ` (${parseMeta.error})` : ""}. ` +
                "Showing a SIZE-BASED FALLBACK estimate — it may differ significantly from actual token usage."
        };
    };

    /* Direct text with no parse metadata (e.g. API consumers sending
       fileText without a prior /api/files/parse call): estimate the
       supplied text instead of reporting zero. */
    if (!parseMeta && text !== null && text !== undefined) {
        const textEst = estimateTextTokens(text, model);
        return {
            ...textEst,
            source: ESTIMATION_SOURCE.HEURISTIC,
            method: "direct-text (no parse metadata)",
            fileSize: fileMeta ? Number(fileMeta.size || 0) : null,
            fileType: ext,
            note: "Text supplied without parse metadata — estimated directly. " +
                "Use /api/files/parse for source-tracked per-file accounting."
        };
    }

    if (!parseMeta || !parseMeta.success) return sizeFallback();

    /* Ref miss (e.g. server restarted after parsing) is never silent:
       labelled size fallback, never a zero. */
    if (refExpired) {
        return {
            ...sizeFallback(),
            source: ESTIMATION_SOURCE.FILE_SIZE,
            parserFailed: true,
            parseError: "estimate-ref-expired",
            note: "Estimate reference expired (the backend restarted after parsing). " +
                "Showing a SIZE-BASED FALLBACK estimate — re-upload the file for exact per-file accounting."
        };
    }

    if (parseMeta.source === "content") {
        const textEst = estimateTextTokens(text, model);
        return {
            ...textEst,
            source: ESTIMATION_SOURCE.EXTRACTED,
            method: `extracted-${parseMeta.format} → heuristic`,
            fileSize: fileMeta ? Number(fileMeta.size || 0) : null,
            fileType: ext,
            extractedChars: parseMeta.characterCount,
            wordCount: parseMeta.wordCount,
            pageCount: parseMeta.pageCount,
            parserWarning: parseMeta.warning || null
        };
    }

    if (parseMeta.source === "ocr") {
        const ocrEst = estimateTextTokens(text || "", model);
        const img = estimateImageTokens(parseMeta.imageWidth, parseMeta.imageHeight);
        return {
            tokens: img.tokens,
            source: ESTIMATION_SOURCE.IMAGE,
            method: `image-approx (${img.tiles || "?"} tiles)`,
            ocrTokens: ocrEst.tokens,
            ocrChars: parseMeta.characterCount,
            imageWidth: parseMeta.imageWidth,
            imageHeight: parseMeta.imageHeight,
            fileSize: fileMeta ? Number(fileMeta.size || 0) : null,
            fileType: ext,
            note: img.note + " OCR text is provided as context only — it is not the image token count.",
            parserWarning: parseMeta.warning || null
        };
    }

    return sizeFallback();
}
