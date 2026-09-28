/* =========================================================
   Estimation-transparency badges + token label helpers.
   ========================================================= */

import { escapeHtml } from "../utils/dom.js";

const TOKEN_LABELS = {
    exact: "Exact count",
    extracted: "From extracted content",
    ocr: "OCR text (context only)",
    image: "Image estimate (approx.)",
    heuristic: "Estimated (heuristic)",
    "file-size": "Size-based fallback",
    mixed: "Mixed sources",
    unknown: "Unknown"
};

const ESTIMATION_CLASSES = {
    exact: "estimation-exact",
    extracted: "estimation-extracted",
    ocr: "estimation-approx",
    image: "estimation-approx",
    heuristic: "estimation-heuristic",
    "file-size": "estimation-approx"
};

function getTokenEstimationLabel(source) {
    return TOKEN_LABELS[source] || "Estimated";
}

function getEstimationClass(source) {
    return ESTIMATION_CLASSES[source] || "";
}

export function estimationBadge(source) {
    const label = getTokenEstimationLabel(source);
    const cls = getEstimationClass(source);
    return `<span class="estimation-badge ${cls}">${escapeHtml(label)}</span>`;
}
