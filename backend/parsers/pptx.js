/* PPTX: unzip + collect <a:t> shape text per slide. */

import { readZipEntries, decodeXmlEntities } from "./zip.js";
import { okResult, failResult } from "./common.js";

export function parsePptx(buffer) {
    let entries;
    try {
        entries = readZipEntries(buffer);
    } catch (error) {
        return failResult("pptx", `PPTX could not be opened as an archive: ${error.message}`);
    }
    const slideNames = [...entries.keys()]
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => {
            const na = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || "0", 10);
            const nb = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || "0", 10);
            return na - nb;
        });
    if (!slideNames.length) return failResult("pptx", "PPTX contains no slide content.");

    const slides = slideNames.map((name) => {
        const xml = entries.get(name).toString("utf8");
        const parts = [];
        const re = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
        let m;
        while ((m = re.exec(xml)) !== null) {
            const value = decodeXmlEntities(m[1]).replace(/<[^>]+>/g, "").trim();
            if (value) parts.push(value);
        }
        return parts.join(" ");
    });
    const text = slides.filter(Boolean).join("\n\n").trim();
    if (!text) return failResult("pptx", "Slides were readable but contained no text content.");
    return okResult("pptx", "content", text, { pageCount: slideNames.length });
}
