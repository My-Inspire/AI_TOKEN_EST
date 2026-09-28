/* =========================================================
   AI COST MONITOR — V3
   parsers.js — format detection + content extraction layer.

   Contract:
     parseFile(file) -> Promise<ParserResult>

   ParserResult (normalized):
   {
     success:        boolean,
     format:         "pdf" | "docx" | "txt" | ...,
     source:         "content" | "ocr" | null,
     text:           string | null,
     characterCount: number | null,
     wordCount:      number | null,
     pageCount:      number | null,   // pdf/pptx
     imageWidth:     number | null,   // images
     imageHeight:    number | null,   // images
     ocrText:        true | false,    // images only
     warning:        string | null,
     error:          string | null
   }

   Rules:
   - Supported formats ALWAYS attempt real extraction.
   - A failed parse returns success:false with the error
     preserved. Callers decide whether to apply a labelled
     size fallback — nothing here silently falls back.
    ========================================================= */

import { parseFileUpload, parseFileJson, getCachedConfig } from "./api.js";


/* ================= FORMAT REGISTRY ================= */

const PARSER_FORMATS = {

    pdf:  { mime: ["application/pdf"],                                                                          parser: "pdf"   },
    docx: { mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],                   parser: "docx"  },
    txt:  { mime: ["text/plain"],                                                                               parser: "text"  },
    xlsx: { mime: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"], parser: "xlsx" },
    csv:  { mime: ["text/csv", "application/csv", "application/vnd.ms-excel"],                                   parser: "csv"   },
    pptx: { mime: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],                 parser: "pptx"  },
    png:  { mime: ["image/png"],                                                                                parser: "image" },
    jpg:  { mime: ["image/jpeg", "image/jpg"],                                                                  parser: "image" },
    jpeg: { mime: ["image/jpeg"],                                                                               parser: "image" },
    webp: { mime: ["image/webp"],                                                                               parser: "image" },
    json: { mime: ["application/json", "text/json"],                                                            parser: "json"  },
    xml:  { mime: ["application/xml", "text/xml"],                                                              parser: "xml"   },
    md:   { mime: ["text/markdown", "text/x-markdown"],                                                         parser: "text"  }

};




/* ================= FORMAT DETECTION ================= */

function getFileExtension(file) {
    const name = file?.name || "";
    const dot = name.lastIndexOf(".");
    if (dot < 0) return "";
    return name.slice(dot + 1).toLowerCase();
}

/* Magic-byte sniffing for the formats where it is distinctive. */
async function sniffFileSignature(file) {
    try {
        const buf = await file.slice(0, 12).arrayBuffer();
        const b = new Uint8Array(buf);

        if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";                  // %PDF
        if (b.length >= 2 && b[0] === 0x50 && b[1] === 0x4B) return "zip";                                                    // PK (docx/xlsx/pptx are zip)
        if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return "png";                  // PNG
        if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "jpg";                                   // JPEG
        if (b.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";              // RIFF....WEBP
        return null;
    } catch {
        return null;
    }
}

/*
 * detectFormat(file) ->
 *   { format, kind, supported, reason }
 * kind: "document" | "spreadsheet" | "presentation" | "image" | "data" | "text"
 */
export async function detectFileFormat(file) {

    if (!file) {
        return { format: null, kind: null, supported: false, reason: "No file provided." };
    }

    const ext = getFileExtension(file);
    const mime = (file.type || "").toLowerCase();
    const sniffed = await sniffFileSignature(file);
    /* JPEG spells two ways — treat them as one for signature comparison. */
    const normExt = ext === "jpeg" ? "jpg" : ext;
    /* ZIP-based OOXML formats: extension decides which OOXML parser.
       Calendar of caveats: misnamed .docx that is really a .pdf is
       caught by the signature check below. */
    if (sniffed === "zip" && ["xlsx", "pptx", "docx"].includes(ext)) {
        return { format: ext, kind: kindOf(ext), supported: true, reason: null };
    }

    /* Signature mismatched the extension — trust bytes over label. */
    if (sniffed && ["pdf", "png", "jpg", "webp"].includes(sniffed) && sniffed !== normExt) {
        const normalized = sniffed === "jpg" && ext === "jpeg" ? "jpg" : sniffed;
        return {
            format: normalized,
            kind: kindOf(normalized),
            supported: true,
            reason: `Extension ".${ext}" did not match the actual ${normalized.toUpperCase()} content; parsed by file signature.`
        };
    }

    if (PARSER_FORMATS[ext]) {
        return { format: ext, kind: kindOf(ext), supported: true, reason: null };
    }

    /* Extension unknown but MIME known */
    for (const [key, def] of Object.entries(PARSER_FORMATS)) {
        if (def.mime.includes(mime)) {
            return { format: key, kind: kindOf(key), supported: true, reason: `Detected via MIME type (${mime}).` };
        }
    }

    return {
        format: ext || "unknown",
        kind: null,
        supported: false,
        reason: `".${ext || "unknown"}" is not a supported format.`
    };
}

function kindOf(format) {
    switch (PARSER_FORMATS[format]?.parser) {
        case "pdf":   return "document";
        case "docx":  return "document";
        case "text":  return "text";
        case "xlsx":  return "spreadsheet";
        case "csv":   return "spreadsheet";
        case "pptx":  return "presentation";
        case "image": return "image";
        case "json":  return "data";
        case "xml":   return "data";
        default:      return null;
    }
}


/* ================= VENDOR LAZY LOADER =================
   Vendored libraries live in frontend/vendor/.
   A library is only fetched when a file actually needs it.
   Security notes (2026-09-26 audit):
   - All vendor assets are self-hosted under vendor/ (no CDN).
   - pdf.js: CVE-2024-4367 mitigation is enforced in parsePdfFile
     via getDocument({ isEvalSupported: false }) + CSP without
     'unsafe-eval' (see backend/server.js). Never set
     isEvalSupported:true. Still pinned at the 3.x UMD build
     because 4.x is ESM-only (pdf.mjs) and needs a loader rewrite;
     the official workaround above fully mitigates the CVE.
   - SheetJS: backend parsers/ are authoritative; this XLSX path
     is an offline fallback only. Read options disable VBA/macros
     and parsing is capped (sheets/rows/cells) — see below.
   - mammoth browser build rejects external/linked images by
     design ("cannot open linked files from a web browser");
     extractRawText never enables external file access.
   - Tesseract assets (worker/core/wasm/tessdata) are pinned to
     vendor/ paths below; no external proxy or remote lang data.
   Pinned versions/hashes: see docs/api.md "Vendor security". */

/* Vendored libs live in frontend/vendor/, relative to index.html. */
const VENDOR_BASE = "vendor/";

const VendorLoader = {

    _cache: new Map(),

    _loadScript(src) {
        if (this._cache.has(src)) {
            return this._cache.get(src);
        }
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = src;
            script.async = false;
            script.onload = () => resolve(src);
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
        this._cache.set(src, promise);
        return promise;
    },

    async pdf() {
        if (window.pdfjsLib) return window.pdfjsLib;
        await this._loadScript(VENDOR_BASE + "pdf.min.js");
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = VENDOR_BASE + "pdf.worker.min.js";
        return window.pdfjsLib;
    },

    async mammoth() {
        if (window.mammoth) return window.mammoth;
        await this._loadScript(VENDOR_BASE + "mammoth.browser.min.js");
        return window.mammoth;
    },

    async xlsx() {
        if (window.XLSX) return window.XLSX;
        await this._loadScript(VENDOR_BASE + "xlsx.full.min.js");
        return window.XLSX;
    },

    async jszip() {
        if (window.JSZip) return window.JSZip;
        await this._loadScript(VENDOR_BASE + "jszip.min.js");
        return window.JSZip;
    },

    async tesseract() {
        if (window.Tesseract) return window.Tesseract;
        await this._loadScript(VENDOR_BASE + "tesseract.min.js");
        return window.Tesseract;
    }

};


/* ================= RESULT HELPERS ================= */

function wordCountOf(text) {
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
}

function okResult(format, source, text, extra = {}) {
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

function failResult(format, error, warning = null) {
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

/* Append a detection reason to a result warning (no-op when absent). */
function mergeWarning(result, reason) {
    if (reason) {
        result.warning = [result.warning, reason].filter(Boolean).join(" ");
    }
    return result;
}


/* ================= INDIVIDUAL PARSERS ================= */

/* ---- TXT / MD ---- */
async function parseTextFile(file, format) {
    const text = await file.text();
    return okResult(format, "content", text);
}

/* ---- JSON ---- */
async function parseJsonFile(file) {
    const raw = await file.text();
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        return failResult("json", `Invalid JSON: ${error.message}`);
    }
    /* Stable, deterministic representation for estimation. */
    const text = JSON.stringify(parsed, null, 1) ?? raw;
    return okResult("json", "content", typeof text === "string" ? text : raw);
}

/* ---- XML ---- */
async function parseXmlFile(file) {
    const raw = await file.text();
    let doc;
    try {
        doc = new DOMParser().parseFromString(raw, "application/xml");
    } catch (error) {
        return failResult("xml", `XML parse failed: ${error.message}`);
    }
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
        return failResult("xml", "Malformed XML document.");
    }
    const chunks = [];
    const walk = (node) => {
        node.childNodes.forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) {
                const value = child.textContent.trim();
                if (value) chunks.push(value);
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                walk(child);
            }
        });
    };
    walk(doc.documentElement);
    const text = chunks.join(" ");
    return okResult("xml", "content", text);
}

/* ---- PDF (pdf.js) ----
   CVE-2024-4367 hardening: eval is ALWAYS disabled
   (isEvalSupported:false); CSP also omits 'unsafe-eval'.
   Page count is capped so a malicious PDF cannot DoS the tab. */
async function parsePdfFile(file) {
    const pdfjs = await VendorLoader.pdf();
    const data = await file.arrayBuffer();

    let pdf;
    try {
        /* isEvalSupported:false is the documented mitigation for
           CVE-2024-4367 (arbitrary JS via FontMatrix). */
        pdf = await pdfjs.getDocument({ data, isEvalSupported: false, isOffscreenCanvasSupported: false }).promise;
    } catch (error) {
        return failResult("pdf", `PDF could not be opened: ${error.message}`);
    }

    /* Cap pages: backend already enforces MAX_FILE_MB; this stops a
       many-empty-pages file from hanging the UI thread. */
    const MAX_PDF_PAGES = 200;
    const totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const truncated = pdf.numPages > MAX_PDF_PAGES;

    const textParts = [];
    try {
        for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
            const page = await pdf.getPage(pageNumber);
            const content = await page.getTextContent();
            const pageText = content.items
                .map((item) => (typeof item.str === "string" ? item.str : ""))
                .filter(Boolean)
                .join(" ");
            if (pageText.trim()) {
                textParts.push(pageText.trim());
            }
        }
    } catch (error) {
        return failResult("pdf", `PDF text extraction failed on page ${textParts.length + 1}: ${error.message}`);
    }

    const text = textParts.join("\n\n");
    if (!text.trim()) {
        return failResult("pdf", "PDF opened, but no extractable text was found (possibly scanned image pages).");
    }
    return okResult("pdf", "content", text, {
        pageCount: pdf.numPages,
        warning: truncated ? `Only the first ${MAX_PDF_PAGES} of ${pdf.numPages} pages were extracted.` : null
    });
}

/* ---- DOCX (mammoth) ----
   Browser build never opens linked/external images
   (CVE-2025-11849 N/A client-side); externalFileAccess stays
   disabled — extractRawText only. Output is plain text. */
async function parseDocxFile(file) {
    const mammoth = await VendorLoader.mammoth();
    const arrayBuffer = await file.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        return failResult("docx", "DOCX is empty.");
    }

    let result;
    try {
        /* No external file access, no HTML conversion (raw text
           only, so embedded styles/scripts cannot execute). */
        result = await mammoth.extractRawText({ arrayBuffer });
    } catch (error) {
        return failResult("docx", `DOCX could not be parsed: ${error.message}`);
    }

    const text = (result?.value || "").trim();
    if (!text) {
        return failResult("docx", "DOCX parsed but contained no extractable text.");
    }
    const warnings = (result?.messages || [])
        .filter((m) => m.type === "warning" || m.type === "error")
        .map((m) => m.message)
        .slice(0, 3);
    return okResult("docx", "content", text, {
        warning: warnings.length ? warnings.join("; ") : null
    });
}

/* ---- XLSX / CSV (SheetJS fallback) ----
   Hardening for CVE-2023-30533 / CVE-2024-22363 era builds:
   VBA/macros/HTML disabled, output coerced to plain strings
   (never assigned to __proto__), and sheets/rows/cells capped
   so a crafted workbook cannot ReDoS or OOM the tab. */
const XLSX_FALLBACK_LIMITS = Object.freeze({
    maxSheets: 50,
    maxRowsPerSheet: 10000,
    maxCellsTotal: 100000,
    maxTextChars: 2 * 1024 * 1024
});

function sheetsToText(workbook) {
    const parts = [];
    let totalCells = 0;
    let truncated = false;
    const sheetNames = (workbook.SheetNames || []).slice(0, XLSX_FALLBACK_LIMITS.maxSheets);
    if ((workbook.SheetNames || []).length > sheetNames.length) truncated = true;
    for (const sheetName of sheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });
        const meaningful = [];
        for (const row of rows.slice(0, XLSX_FALLBACK_LIMITS.maxRowsPerSheet)) {
            if (!Array.isArray(row)) continue;
            const cells = [];
            for (const cell of row) {
                if (totalCells >= XLSX_FALLBACK_LIMITS.maxCellsTotal) { truncated = true; break; }
                totalCells++;
                /* String() coercion only — never used as an object key. */
                const value = (cell === null || cell === undefined ? "" : String(cell)).trim();
                if (value) cells.push(value.slice(0, 10000));
            }
            if (cells.length) meaningful.push(cells);
            if (totalCells >= XLSX_FALLBACK_LIMITS.maxCellsTotal) break;
        }
        if (rows.length > XLSX_FALLBACK_LIMITS.maxRowsPerSheet) truncated = true;
        if (meaningful.length) {
            /* Sheet name is display-only; strip control chars. */
            const safeName = String(sheetName).replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 100);
            parts.push(`[Sheet: ${safeName}]`);
            parts.push(meaningful.map((row) => row.join(" | ")).join("\n"));
        }
    }
    let text = parts.join("\n\n");
    if (text.length > XLSX_FALLBACK_LIMITS.maxTextChars) {
        text = text.slice(0, XLSX_FALLBACK_LIMITS.maxTextChars);
        truncated = true;
    }
    return { text, truncated };
}

function xlsxReadOptions(type) {
    /* bookVBA:false drops macros, WTF:false throws on malformed
       strings instead of guessing, cellHTML:false keeps values as
       plain text. codepage:65001 forces UTF-8 handling. */
    return { type, WTF: false, bookVBA: false, cellHTML: false, sheetStubs: false, codepage: 65001 };
}

async function parseXlsxFile(file) {
    await VendorLoader.xlsx();
    const data = await file.arrayBuffer();

    let workbook;
    try {
        workbook = XLSX.read(data, xlsxReadOptions("array"));
    } catch (error) {
        return failResult("xlsx", `XLSX could not be opened: ${error.message}`);
    }

    const { text, truncated } = sheetsToText(workbook);
    if (!text.trim()) {
        return failResult("xlsx", "Workbook opened but contains no cell values.");
    }
    return okResult("xlsx", "content", text, {
        pageCount: workbook.SheetNames.length,
        warning: truncated ? "Workbook was truncated to safety limits (sheets/rows/cells)." : null
    });
}

async function parseCsvFile(file) {
    const raw = await file.text();
    /* CSV is plain text — cap before handing to SheetJS (ReDoS guard). */
    const capped = raw.length > XLSX_FALLBACK_LIMITS.maxTextChars
        ? raw.slice(0, XLSX_FALLBACK_LIMITS.maxTextChars)
        : raw;
    await VendorLoader.xlsx();

    let workbook;
    try {
        workbook = XLSX.read(capped, xlsxReadOptions("string"));
    } catch (error) {
        /* SheetJS failed; fall back to raw text — CSV is plain text. */
        return okResult("csv", "content", capped, { warning: `CSV parsed as raw text: ${error.message}` });
    }

    const { text, truncated } = sheetsToText(workbook);
    return okResult("csv", "content", text || capped, {
        warning: truncated || capped.length !== raw.length
            ? "CSV was truncated to safety limits."
            : null
    });
}

/* ---- PPTX (JSZip + XML) ----
   JSZip 3.10.1 has no direct vuln; still hardened: entry count
   capped (zip-bomb guard), traversal names rejected, and only
   ppt/slides/slideN.xml are ever read (never executed). */
async function parsePptxFile(file) {
    const JSZipClass = await VendorLoader.jszip();
    const data = await file.arrayBuffer();

    let zip;
    try {
        zip = await JSZipClass.loadAsync(data);
    } catch (error) {
        return failResult("pptx", `PPTX could not be opened as an archive: ${error.message}`);
    }

    const allNames = Object.keys(zip.files);
    /* Zip-bomb / traversal guard (CVE-2022-48285 era pattern). */
    if (allNames.length > 1000) {
        return failResult("pptx", "PPTX contains too many archive entries.");
    }
    for (const name of allNames) {
        if (name.includes("..") || name.startsWith("/") || name.startsWith("\\") || /[A-Za-z]:\\/.test(name)) {
            return failResult("pptx", "PPTX contains an unsafe archive entry.");
        }
    }

    const slideNames = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => {
            const na = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || "0", 10);
            const nb = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || "0", 10);
            return na - nb;
        });

    if (!slideNames.length) {
        return failResult("pptx", "PPTX contains no slide XML content.");
    }
    /* Cap slides + per-slide XML size (DoS guard). */
    const MAX_SLIDES = 200;
    const MAX_SLIDE_XML = 2 * 1024 * 1024;
    const cappedSlides = slideNames.slice(0, MAX_SLIDES);
    const truncatedSlides = slideNames.length > cappedSlides.length;

    const slideTexts = [];
    for (const name of cappedSlides) {
        let xmlText;
        try {
            xmlText = await zip.files[name].async("string");
        } catch {
            slideTexts.push("");
            continue;
        }
        if (xmlText.length > MAX_SLIDE_XML) {
            slideTexts.push("");
            continue;
        }
        const doc = new DOMParser().parseFromString(xmlText, "application/xml");
        if (doc.querySelector("parsererror")) {
            slideTexts.push("");
            continue;
        }
        const textNodes = Array.from(doc.getElementsByTagNameNS("*", "t"))
            .map((node) => node.textContent.trim())
            .filter(Boolean);
        slideTexts.push(textNodes.join(" "));
    }

    const text = slideTexts.filter(Boolean).join("\n\n");
    if (!text.trim()) {
        return failResult("pptx", "Slides were readable but contained no text content.");
    }
    return okResult("pptx", "content", text, {
        pageCount: slideNames.length,
        warning: truncatedSlides ? `Only the first ${MAX_SLIDES} of ${slideNames.length} slides were extracted.` : null
    });
}

/* ---- IMAGES (Tesseract OCR) ----
   Returns OCR text AND image metadata. The caller decides how to
   present it: OCR text is raw text, but token usage for vision
   models is NOT equivalent to the OCR text token count.
   Assets are pinned to self-hosted vendor/ paths (no CDN/proxy).
   OCR runs on a downscaled copy (1600px long edge): full-res
   phone photos make Tesseract take tens of seconds with no
   accuracy gain. Reported dimensions stay original — token
   math uses those, not the OCR copy. */
function ocrReadyImage(file, maxEdge = 1600) {
    const done = (value) => Promise.resolve(value);
    try {
        if (typeof createImageBitmap !== "function" || typeof document === "undefined") return done(file);
        return createImageBitmap(file).then((bitmap) => {
            const long = Math.max(bitmap.width || 0, bitmap.height || 0);
            if (!long || long <= maxEdge) {
                try { bitmap.close?.(); } catch { /* noop */ }
                return file;
            }
            const scale = maxEdge / long;
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                try { bitmap.close?.(); } catch { /* noop */ }
                return file;
            }
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            try { bitmap.close?.(); } catch { /* noop */ }
            return new Promise((resolve) => {
                try {
                    canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.85);
                } catch {
                    resolve(file);
                }
            });
        }).catch(() => file);
    } catch {
        return done(file);
    }
}
/* Race a promise against a timer so a hung stage (worker that never
   initializes, OCR that never returns) becomes a labelled failure
   instead of a frozen "processing" row that also blocks Continue,
   which awaits every in-flight parse. */
function withTimeout(promise, ms, label) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer !== null) clearTimeout(timer);
    });
}

async function parseImageFile(file, format) {
    let imageWidth = null, imageHeight = null;
    try {
        const url = URL.createObjectURL(file);
        /* Capped: a corrupt image can leave Image with neither onload
           nor onerror, which would hang the parse forever. */
        const dims = await withTimeout(new Promise((resolve) => {
            const img = new Image();
            img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
            img.onerror = () => { URL.revokeObjectURL(url); resolve({ w: null, h: null }); };
            img.src = url;
        }), 10000, "Image dimensions").catch(() => {
            try { URL.revokeObjectURL(url); } catch { /* noop */ }
            return { w: null, h: null };
        });
        imageWidth = dims.w;
        imageHeight = dims.h;
    } catch { /* dimensions unavailable */ }

    let ocrText = "";
    try {
        const Tesseract = await VendorLoader.tesseract();
        /* Downscale itself is capped: on failure use the original file
           rather than failing the whole parse. */
        const ocrInput = await withTimeout(ocrReadyImage(file), 20000, "Image downscale").catch(() => file);
        /* Tesseract v5 URL rules (verified against the vendored
           worker source): corePath is a DIRECTORY — the worker strips
           a trailing slash and appends the core filename itself, so a
           file path 404s inside importScripts and the job hangs. All
           three are root-absolute because the worker resolves relative
           URLs against its own script URL (/vendor/…), not the page —
           relative paths double the prefix and 404 the same way. The
           backend always serves frontend/ at /, so absolute is safe. */
        const result = await withTimeout(Tesseract.recognize(ocrInput, "eng", {
            workerPath: "/vendor/tesseract.worker.min.js",
            corePath: "/vendor",
            langPath: "/vendor/tessdata",
            /* legacyCore selects the full engine build that is actually
               vendored (tesseract-core[-simd].wasm.js). Without it v5
               requests the slim "-lstm" core variants, which were never
               vendored — their importScripts 404 hangs/fails every job.
               OEM stays LSTM (default) with the standard traineddata. */
            legacyCore: true
        }), 120000, "OCR");
        ocrText = (result?.data?.text || "").trim();
    } catch (error) {
        /* Tesseract can reject with a non-Error (string, event, or
           empty) — never render "undefined", and log the raw value so
           the real cause is one F12-Console look away. */
        console.error("OCR failed", error);
        const detail = error?.message || (typeof error === "string" && error) || "unknown error";
        return failResult(format, `OCR failed: ${detail}`, "Image token estimation will use size-based fallback.");
    }

    if (!ocrText) {
        return okResult(format, "ocr", "", {
            imageWidth,
            imageHeight,
            ocrText: true,
            warning: "OCR completed but found no legible text. Image token estimation uses image metadata only."
        });
    }

    return okResult(format, "ocr", ocrText, { imageWidth, imageHeight, ocrText: true });
}


/* ================= LOCAL ROUTER (client fallback) =================
   Preserved vendor path. Used directly for images (OCR) and as
   fallback whenever the backend cannot parse a file. */

async function parseFileLocal(file) {

    if (!file) {
        return failResult("unknown", "No file provided.");
    }

    const detection = await detectFileFormat(file);

    if (!detection.supported) {
        return {
            ...failResult(detection.format || "unknown", detection.reason),
            unsupported: true
        };
    }

    const format = detection.format;
    const parser = PARSER_FORMATS[format]?.parser;

    let result;
    try {
        switch (parser) {
            case "pdf":   result = await parsePdfFile(file); break;
            case "docx":  result = await parseDocxFile(file); break;
            case "text":  result = await parseTextFile(file, format); break;
            case "json":  result = await parseJsonFile(file); break;
            case "xml":   result = await parseXmlFile(file); break;
            case "xlsx":  result = await parseXlsxFile(file); break;
            case "csv":   result = await parseCsvFile(file); break;
            case "pptx":  result = await parsePptxFile(file); break;
            case "image": result = await parseImageFile(file, format); break;
            default:      result = failResult(format, "No parser registered for this format.");
        }
    } catch (error) {
        /* A parser threw unexpectedly — convert to a normalized failure. */
        result = failResult(format, error);
    }

    mergeWarning(result, detection.reason);

    return result;
}


/* ================= FILE STATUS (UI labels) =================
   Only statuses set by the app are kept. */

export const FILE_STATUS = {
    PROCESSING: "processing",
    COMPLETED: "completed",
    FAILED: "failed",
    UNSUPPORTED: "unsupported"
};

const FILE_STATUS_LABELS = {
    [FILE_STATUS.PROCESSING]: "Extracting content…",
    [FILE_STATUS.COMPLETED]: "Content extracted",
    [FILE_STATUS.FAILED]: "Processing failed",
    [FILE_STATUS.UNSUPPORTED]: "Format not supported"
};

const FILE_STATUS_CLASSES = {
    [FILE_STATUS.PROCESSING]: "status-processing",
    [FILE_STATUS.COMPLETED]: "status-completed",
    [FILE_STATUS.FAILED]: "status-failed",
    [FILE_STATUS.UNSUPPORTED]: "status-unsupported"
};

export function getFileStatusLabel(status) {
    return FILE_STATUS_LABELS[status] || "Unknown";
}

export function getFileStatusClass(status) {
    return FILE_STATUS_CLASSES[status] || "status-unknown";
}

/* ================= BACKEND-FIRST ORCHESTRATION ================= */

function maxBytes() {
    const fromApi = Number(getCachedConfig()?.maxFileSizeMB);
    const mb = Number.isFinite(fromApi) && fromApi > 0 ? fromApi : 50;
    return { maxBytes: mb * 1024 * 1024, maxMB: mb };
}

/* Smart parse: images stay local (OCR); everything else tries the
   backend first and falls back to the vendor path on any failure.
   Returns { result, tokens, fallback } — tokens always computed
   server-side except in the local fallback chain. */
export async function parseFile(file, modelId = null) {
    if (!file) {
        return { result: failResult("unknown", "No file provided."), tokens: null, fallback: false };
    }
    const detection = await detectFileFormat(file);
    if (!detection.supported) {
        return {
            result: { ...failResult(detection.format || "unknown", detection.reason), unsupported: true },
            tokens: null,
            fallback: false
        };
    }
    if (detection.kind === "image") {
        const result = await parseFileLocal(file);
        return { result, tokens: null, fallback: true, local: true };
    }
    const { maxBytes: limit, maxMB } = maxBytes();
    if (file.size > limit) {
        return {
            result: failResult(detection.format, `File exceeds the ${maxMB} MB limit.`),
            tokens: null,
            fallback: false,
            tooLarge: true
        };
    }
    try {
        const form = new FormData();
        form.append("file", file, file.name);
        const data = await parseFileUpload(form, modelId);
        if (data?.result?.success) {
            mergeWarning(data.result, detection.reason);
            return { result: data.result, tokens: data.tokens || null, fallback: false, ref: data.ref || null };
        }
        if (data?.result && !data.result.success) {
            /* Backend could not extract (e.g. custom PDF font encodings
               the minimal server reader rejects) — try the in-browser
               vendor path before accepting the size-based fallback. */
            try {
                const local = await parseFileLocal(file);
                if (local?.success) {
                    mergeWarning(local, detection.reason);
                    return { result: local, tokens: null, fallback: true, local: true };
                }
            } catch {
                /* Local retry failed too — keep the backend result below. */
            }
            const failed = data.result;
            mergeWarning(failed, detection.reason);
            return { result: failed, tokens: data.tokens || null, fallback: false };
        }
    } catch {
        /* Backend unavailable or failed — fall through to vendors. */
        const result = await parseFileLocal(file);
        mergeWarning(result, detection.reason);
        return { result, tokens: null, fallback: true, local: true, ref: null, serverUnreachable: true };
    }
    const result = await parseFileLocal(file);
    mergeWarning(result, detection.reason);
    return { result, tokens: null, fallback: true, local: true, ref: null };
}

/* Size-based fallback estimate, computed server-side (owns table). */
export async function fetchSizeEstimate(filename, size) {
    try {
        const data = await parseFileJson({ filename, size });
        return data?.tokens || null;
    } catch {
        return null;
    }
}

/* Token estimate for already-extracted (locally parsed) text.
   Carries the server's estimate ref on the tokens object so later
   calculate calls send the ref instead of re-uploading the text. */
export async function fetchTextTokens({ filename, text, parseMeta, modelId }) {
    const data = await parseFileJson({ filename, text, parseMeta: parseMeta || null, modelId: modelId || null });
    const tokens = data?.tokens || null;
    if (tokens && data?.ref) tokens.ref = data.ref;
    return tokens;
}
