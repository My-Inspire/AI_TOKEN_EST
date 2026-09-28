/* XLSX: unzip + shared strings + worksheet cell text. */

import { readZipEntries, decodeXmlEntities } from "./zip.js";
import { okResult, failResult } from "./common.js";

function cellText(xml) {
    // Shared-string (<t>) and inline (<v>) cell values.
    const parts = [];
    const re = /<(?:t|v)(?:\s[^>]*)?>([\s\S]*?)<\/(?:t|v)>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        const value = decodeXmlEntities(m[1]).replace(/<[^>]+>/g, "").trim();
        if (value) parts.push(value);
    }
    return parts;
}

export function parseXlsx(buffer) {
    let entries;
    try {
        entries = readZipEntries(buffer);
    } catch (error) {
        return failResult("xlsx", `XLSX could not be opened as an archive: ${error.message}`);
    }
    const sheetNames = [...entries.keys()]
        .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
        .sort((a, b) => {
            const na = parseInt(a.match(/sheet(\d+)\.xml/i)?.[1] || "0", 10);
            const nb = parseInt(b.match(/sheet(\d+)\.xml/i)?.[1] || "0", 10);
            return na - nb;
        });
    if (!sheetNames.length) return failResult("xlsx", "Workbook contains no worksheets.");

    const parts = [];
    sheetNames.forEach((name, index) => {
        const cells = cellText(entries.get(name).toString("utf8"));
        if (cells.length) {
            parts.push(`[Sheet ${index + 1}]`);
            parts.push(cells.join(" | "));
        }
    });
    const text = parts.join("\n\n").trim();
    if (!text) return failResult("xlsx", "Workbook opened but contains no cell values.");
    return okResult("xlsx", "content", text, { pageCount: sheetNames.length });
}
