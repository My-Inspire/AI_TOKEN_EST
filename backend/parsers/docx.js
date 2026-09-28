/* DOCX: unzip + collect <w:t> paragraph text runs. */

import { readZipEntries, decodeXmlEntities } from "./zip.js";
import { okResult, failResult } from "./common.js";

export function parseDocx(buffer) {
    let entries;
    try {
        entries = readZipEntries(buffer);
    } catch (error) {
        return failResult("docx", `DOCX could not be opened as an archive: ${error.message}`);
    }
    const docXml = entries.get("word/document.xml");
    if (!docXml) return failResult("docx", "DOCX is missing word/document.xml.");

    const text = [];
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let m;
    while ((m = re.exec(docXml.toString("utf8"))) !== null) {
        const value = decodeXmlEntities(m[1]).replace(/<[^>]+>/g, "");
        if (value) text.push(value);
    }
    const joined = text.join(" ").replace(/\s+/g, " ").trim();
    if (!joined) return failResult("docx", "DOCX parsed but contained no extractable text.");
    const warnings = [];
    for (const name of entries.keys()) {
        if (/^word\/(footnotes|endnotes|comments)\.xml$/.test(name)) {
            warnings.push("Footnotes/endnotes/comments are not included in the estimate.");
            break;
        }
    }
    return okResult("docx", "content", joined, { warning: warnings.join(" ") || null });
}
