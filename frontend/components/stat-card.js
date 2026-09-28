/* =========================================================
   KPI stat card.
   ========================================================= */

import { escapeHtml } from "../utils/dom.js";

export function statCard({ label, value, hint = "", accent = "", id = "", iconSvg = "" }) {
    return `
        <article class="stat-card ${accent}">
            ${iconSvg ? `<span class="stat-ico" aria-hidden="true">${iconSvg}</span>` : ""}
            <span class="stat-label">${escapeHtml(label)}</span>
            <strong${id ? ` id="${id}"` : ""}>${value}</strong>
            ${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
        </article>`;
}
