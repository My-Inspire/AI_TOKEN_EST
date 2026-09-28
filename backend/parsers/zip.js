/* =========================================================
   Minimal ZIP reader (stored + deflated entries) for OOXML
   files (docx/xlsx/pptx). Zero dependencies — uses zlib.
   Sizes come from the central directory, so entries using
   data descriptors also resolve correctly.
   ========================================================= */

import { inflateRawSync } from "node:zlib";

/* Zip-bomb guards: uploads are already capped compressed (MAX_FILE_MB),
   but a small archive can decompress to gigabytes. Limits stay generous
   for legitimate enterprise workbooks — beyond them the file is treated
   as corrupt (callers convert the throw to a labelled failure). */
const MAX_ZIP_ENTRIES = 2000;
const MAX_ZIP_ENTRY_BYTES = 128 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 256 * 1024 * 1024;

export function readZipEntries(buffer) {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    if (buf.length < 22 || buf[0] !== 0x50 || buf[1] !== 0x4B) {
        throw new Error("Not a ZIP archive.");
    }
    // Locate End Of Central Directory (scan last 64KB + 22).
    let eocd = -1;
    const start = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= start; i--) {
        if (buf[i] === 0x50 && buf[i + 1] === 0x4B && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error("ZIP end-of-central-directory not found.");

    const count = buf.readUInt16LE(eocd + 10);
    if (count > MAX_ZIP_ENTRIES) {
        throw new Error(`ZIP has too many entries (${count}).`);
    }
    let offset = buf.readUInt32LE(eocd + 16);
    const entries = new Map();
    let totalBytes = 0;

    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(offset) !== 0x02014b50) {
            throw new Error("ZIP central directory is corrupt.");
        }
        const method = buf.readUInt16LE(offset + 10);
        const compSize = buf.readUInt32LE(offset + 20);
        const nameLen = buf.readUInt16LE(offset + 28);
        const extraLen = buf.readUInt16LE(offset + 30);
        const commentLen = buf.readUInt16LE(offset + 32);
        const localOffset = buf.readUInt32LE(offset + 42);
        const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);
        offset += 46 + nameLen + extraLen + commentLen;

        if (name.endsWith("/")) continue; // directory
        if (buf.readUInt32LE(localOffset) !== 0x04034b50) {
            throw new Error(`ZIP local header missing for "${name}".`);
        }
        const localNameLen = buf.readUInt16LE(localOffset + 26);
        const localExtraLen = buf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLen + localExtraLen;
        const data = buf.subarray(dataStart, dataStart + compSize);

        let content;
        if (method === 0) content = Buffer.from(data);
        else if (method === 8) content = inflateRawSync(data);
        else throw new Error(`Unsupported ZIP method ${method} for "${name}".`);
        if (content.length > MAX_ZIP_ENTRY_BYTES) {
            throw new Error(`ZIP entry "${name}" is too large when decompressed.`);
        }
        totalBytes += content.length;
        if (totalBytes > MAX_ZIP_TOTAL_BYTES) {
            throw new Error("ZIP contents are too large when decompressed.");
        }
        entries.set(name, content);
    }
    return entries;
}

/* Decode the common XML entities found in OOXML text nodes. */
export function decodeXmlEntities(text) {
    return String(text ?? "")
        .replace(/&(lt|gt|amp|quot|apos);/g, (_, e) =>
            ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[e])
        .replace(/&#(\d+);/g, (_, code) => {
            const n = Number(code);
            return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : "";
        })
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
            const n = parseInt(hex, 16);
            return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : "";
        });
}
