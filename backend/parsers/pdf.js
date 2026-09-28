/* =========================================================
   PDF text extraction (dependency-free subset).
   Handles WinAnsi-encoded literal/hex strings in FlateDecode
   or raw content streams. Anything else — custom encodings,
   unsupported filters, no extractable text — returns a
   labelled failure so callers use the client pdf.js fallback.
   Never returns garbled text as if it were content.
   ========================================================= */

import { inflateRawSync } from "node:zlib";
import { okResult, failResult } from "./common.js";

/* WinAnsi best-effort decode; null when unmappable. */
function winAnsiChar(code) {
    if (code < 32 || code > 255) return null;
    if (code >= 32 && code <= 126) return String.fromCharCode(code);
    const extra = {
        0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†",
        0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8A: "Š", 0x8B: "‹", 0x8C: "Œ",
        0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–",
        0x97: "—", 0x98: "˜", 0x99: "™", 0x9A: "š", 0x9B: "›", 0x9C: "œ",
        0x9F: "Ÿ", 0xA0: " "
    };
    if (extra[code] !== undefined) return extra[code];
    if (code >= 0xA1) return String.fromCharCode(code);
    return null;
}

/* Parse a literal string starting after the opening "(". Returns
   { bytes, end } where end is the index past the closing ")". */
function parseLiteral(data, start) {
    const bytes = [];
    let i = start;
    let depth = 1;
    while (i < data.length && depth > 0) {
        const b = data[i];
        if (b === 0x5C) { // backslash escape
            const n = data[i + 1];
            if (n === undefined) break;
            if (n === 0x6E) bytes.push(0x0A); // \n
            else if (n === 0x72) bytes.push(0x0D); // \r
            else if (n === 0x74) bytes.push(0x09); // \t
            else if (n >= 0x30 && n <= 0x37) { // octal \ddd
                let oct = "";
                let j = i + 1;
                while (j < data.length && oct.length < 3 && data[j] >= 0x30 && data[j] <= 0x37) {
                    oct += String.fromCharCode(data[j]);
                    j++;
                }
                bytes.push(parseInt(oct, 8) & 0xFF);
                i = j;
                continue;
            } else if (n === 0x0D || n === 0x0A) {
                // line continuation: skip (+ LF after CR)
                if (n === 0x0D && data[i + 2] === 0x0A) i++;
            } else {
                bytes.push(n);
            }
            i += 2;
            continue;
        }
        if (b === 0x28) { depth++; bytes.push(b); i++; continue; }
        if (b === 0x29) {
            depth--;
            if (depth === 0) { i++; break; }
            bytes.push(b); i++; continue;
        }
        bytes.push(b);
        i++;
    }
    return { bytes, end: i, closed: depth === 0 };
}

function decodeBytes(bytes) {
    let text = "";
    let unmapped = 0;
    for (const b of bytes) {
        const ch = winAnsiChar(b);
        if (ch === null) unmapped++;
        else text += ch;
    }
    return { text, unmapped, total: bytes.length };
}

/* Extract text-showing operands (Tj, TJ, ', ") from a stream. */
function extractStreamText(data) {
    const parts = [];
    let unmapped = 0;
    let total = 0;
    let i = 0;
    const isSpace = (b) => b === 0x20 || b === 0x0A || b === 0x0D || b === 0x09 || b === 0x0C || b === 0x00;

    while (i < data.length) {
        const b = data[i];
        if (b === 0x28) { // literal string
            const { bytes, end, closed } = parseLiteral(data, i + 1);
            if (!closed) { i = end; continue; }
            // Check the operator that follows.
            let j = end;
            while (j < data.length && isSpace(data[j])) j++;
            let op = "";
            const slice = data.subarray(j, j + 3).toString("latin1");
            if (slice.startsWith("Tj")) op = "Tj";
            else if (slice === "'\n" || slice[0] === "'") op = "'";
            else if (slice[0] === '"') op = '"';
            if (op) {
                const { text, unmapped: u, total: t } = decodeBytes(bytes);
                unmapped += u;
                total += t;
                parts.push(text);
            }
            i = end;
            continue;
        }
        if (b === 0x3C && data[i + 1] !== 0x3C) { // hex string (not dict)
            let j = i + 1;
            let hex = "";
            while (j < data.length && data[j] !== 0x3E) {
                const c = data[j];
                if (!isSpace(c)) hex += String.fromCharCode(c);
                j++;
            }
            // UTF-16BE marker means custom encoding — bail on this string.
            if (/^feff/i.test(hex)) { i = j + 1; continue; }
            if (hex.length % 2 === 1) hex += "0";
            const bytes = [];
            for (let k = 0; k < hex.length; k += 2) {
                bytes.push(parseInt(hex.slice(k, k + 2), 16));
            }
            let k = j + 1;
            while (k < data.length && isSpace(data[k])) k++;
            const slice = data.subarray(k, k + 2).toString("latin1");
            if (slice.startsWith("Tj")) {
                const { text, unmapped: u, total: t } = decodeBytes(bytes);
                unmapped += u;
                total += t;
                parts.push(text);
            }
            i = j + 1;
            continue;
        }
        if (b === 0x5B) { // [ ... ] array — TJ kerned-text arrays
            let j = i + 1;
            const chunks = [];
            let ok = true;
            let closed = false;
            while (j < data.length) {
                const c = data[j];
                if (isSpace(c)) { j++; continue; }
                if (c === 0x28) {
                    const lit = parseLiteral(data, j + 1);
                    if (!lit.closed) { ok = false; break; }
                    chunks.push(lit.bytes);
                    j = lit.end;
                    continue;
                }
                if (c === 0x3C) {
                    if (data[j + 1] === 0x3C) { ok = false; break; }
                    let k = j + 1;
                    let hex = "";
                    while (k < data.length && data[k] !== 0x3E) {
                        if (!isSpace(data[k])) hex += String.fromCharCode(data[k]);
                        k++;
                    }
                    if (!/^feff/i.test(hex)) {
                        if (hex.length % 2 === 1) hex += "0";
                        const hb = [];
                        for (let q = 0; q < hex.length; q += 2) hb.push(parseInt(hex.slice(q, q + 2), 16));
                        chunks.push(hb);
                    }
                    j = k + 1;
                    continue;
                }
                if (c === 0x5D) { closed = true; j++; break; }
                if ((c >= 0x30 && c <= 0x39) || c === 0x2D || c === 0x2E || c === 0x2B) {
                    while (j < data.length && !isSpace(data[j]) && data[j] !== 0x5D) j++;
                    continue;
                }
                ok = false;
                break;
            }
            if (ok && closed && chunks.length) {
                let k = j;
                while (k < data.length && isSpace(data[k])) k++;
                if (data.subarray(k, k + 2).toString("latin1") === "TJ") {
                    const texts = [];
                    for (const bytes of chunks) {
                        const decoded = decodeBytes(bytes);
                        unmapped += decoded.unmapped;
                        total += decoded.total;
                        texts.push(decoded.text);
                    }
                    parts.push(texts.join(""));
                    i = j;
                    continue;
                }
            }
            i = j;
            continue;
        }
        i++;
    }
    return { parts, unmapped, total };
}

function findStreamObjects(buf) {
    // Per-object scan: header → dict → stream keyword → /Length bytes.
    // (A single lazy `obj…stream` regex would swallow several
    // objects at once, so headers are located first.)
    const text = buf.toString("latin1");
    const headers = [];
    const headerRe = /(\d+)\s+(\d+)\s+obj\b/g;
    let hm;
    while ((hm = headerRe.exec(text)) !== null) {
        headers.push({ start: hm.index, end: hm.index + hm[0].length });
    }
    const streams = [];
    for (let h = 0; h < headers.length; h++) {
        const regionEnd = h + 1 < headers.length ? headers[h + 1].start : text.length;
        const region = text.slice(headers[h].end, regionEnd);
        const sm = region.match(/stream\r?\n/);
        if (!sm) continue;
        const dict = region.slice(0, sm.index);
        const lenMatch = dict.match(/\/Length\s+(\d+)/);
        if (!lenMatch) continue; // indirect /Length — unsupported subset
        const dataStart = headers[h].end + sm.index + sm[0].length;
        const dataEnd = dataStart + Number(lenMatch[1]);
        if (dataEnd > buf.length) continue;
        const endMarker = buf.toString("latin1", dataEnd, dataEnd + 12);
        if (!endMarker.startsWith("endstream") && !endMarker.startsWith("\r\nendstream") && !endMarker.startsWith("\nendstream")) {
            continue;
        }
        streams.push({ dict, data: buf.subarray(dataStart, dataEnd) });
    }
    return streams;
}

export function parsePdf(buffer) {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
    if (buf.length < 5 || buf.toString("latin1", 0, 5) !== "%PDF-") {
        return failResult("pdf", "Not a PDF document.");
    }

    const streams = findStreamObjects(buf);
    if (!streams.length) {
        return failResult("pdf", "PDF has no readable content streams (possibly scanned image pages).");
    }

    const chunks = [];
    let unmapped = 0;
    let total = 0;
    let pageCount = null;
    const countMatch = buf.toString("latin1", 0, Math.min(buf.length, 200000)).match(/\/Count\s+(\d+)/);
    if (countMatch) pageCount = Number(countMatch[1]);

    for (const { dict, data } of streams) {
        /* Image XObjects never hold text — skip before inflating so
           multi-megapixel scans don't burn time/memory, and stray
           Tj-like byte sequences in pixel data can't inject garbage
           text into the estimate. */
        if (/\/Subtype\s*\/Image/.test(dict)) continue;
        const filterMatch = dict.match(/\/Filter\s*(\/[A-Za-z0-9]+|\[[^\]]*\])/);
        const filter = filterMatch ? filterMatch[1] : null;
        let content = null;
        if (!filter || filter === "/FlateDecode") {
            try {
                // PDF FlateDecode is raw deflate (no zlib wrapper).
                content = filter ? inflateRawSync(Buffer.from(data)) : Buffer.from(data);
            } catch {
                continue; // undecodable stream — skip, like image/xobject streams
            }
        } else {
            continue; // unsupported filter (DCTDecode images, etc.)
        }
        // Only text-bearing streams matter; image/xobject streams yield nothing.
        if (!/Tj|TJ|'|"/.test(content.toString("latin1", 0, Math.min(content.length, 4000))) &&
            !/Tj|TJ/.test(content.toString("latin1"))) {
            continue;
        }
        const { parts, unmapped: u, total: t } = extractStreamText(content);
        unmapped += u;
        total += t;
        const joined = parts.join(" ").replace(/\s+/g, " ").trim();
        if (joined) chunks.push(joined);
    }

    const text = chunks.join("\n\n").trim();
    if (!text) {
        return failResult("pdf", "PDF opened, but no extractable text was found (possibly scanned image pages).");
    }
    if (total > 0 && unmapped / total > 0.15) {
        return failResult(
            "pdf",
            "PDF uses custom font encodings the server reader cannot decode reliably.",
            "Use the in-browser extraction instead."
        );
    }
    return okResult("pdf", "content", text, { pageCount });
}
