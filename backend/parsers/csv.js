/* CSV: quote-aware row parsing, rendered as delimited text. */

import { okResult, failResult } from "./common.js";

function parseRows(raw) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (quoted) {
            if (ch === '"') {
                if (raw[i + 1] === '"') { cell += '"'; i++; }
                else quoted = false;
            } else {
                cell += ch;
            }
        } else if (ch === '"') {
            quoted = true;
        } else if (ch === ",") {
            row.push(cell);
            cell = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && raw[i + 1] === "\n") i++;
            row.push(cell);
            cell = "";
            if (row.some((c) => c !== "")) rows.push(row);
            row = [];
        } else {
            cell += ch;
        }
    }
    row.push(cell);
    if (row.some((c) => c !== "")) rows.push(row);
    return rows;
}

export function parseCsv(buffer) {
    try {
        const raw = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer ?? "");
        const rows = parseRows(raw);
        if (!rows.length) return failResult("csv", "CSV contains no data rows.");
        const text = rows.map((r) => r.join(" | ")).join("\n");
        return okResult("csv", "content", text);
    } catch (error) {
        return failResult("csv", error);
    }
}
