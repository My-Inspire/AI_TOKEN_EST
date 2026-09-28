/* =========================================================
   Trend + distribution charts (pure HTML/SVG, no dependencies).
   ========================================================= */

import { escapeHtml } from "../utils/dom.js";

/* Bar + line trend combo (pure inline SVG, no dependencies). Points:
   [{ value, label }]. Bright-yellow bars per calculation with a bold
   direction-colored line overlay — green for rise/flat, red for
   decline — so session trajectory reads at a glance. Same min/max
   scaling and guides as the other trend charts. */
export function trendComboChart(points, { formatValue = (v) => String(v), ariaLabel = "Trend chart" } = {}) {
    if (!Array.isArray(points) || points.length === 0) {
        return `<div class="trend-chart" role="img" aria-label="${escapeHtml(ariaLabel)}"></div>`;
    }
    const W = 600;
    const H = 200;
    const PAD = { l: 8, r: 8, t: 14, b: 26 };
    const values = points.map((p) => Number(p.value) || 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const base = H - PAD.b;
    const x = (i) => points.length < 2
        ? (W - PAD.l - PAD.r) / 2 + PAD.l
        : PAD.l + ((W - PAD.l - PAD.r) * i) / (points.length - 1);
    const y = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - min) / span);
    const segColor = (i) => values[i + 1] >= values[i] ? "var(--success)" : "var(--danger)";
    const barW = Math.min(((W - PAD.l - PAD.r) / values.length) * 0.5, 54);
    const bars = points.map((p, i) => {
        const top = y(values[i]);
        return `<rect x="${(x(i) - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(base - top, 2).toFixed(1)}" rx="4" fill="var(--trend-bar)" opacity="0.9"><title>${escapeHtml(p.label)}: ${escapeHtml(formatValue(values[i]))}</title></rect>`;
    }).join("");
    const segments = points.length > 1
        ? points.slice(0, -1).map((p, i) =>
            `<line x1="${x(i).toFixed(1)}" y1="${y(values[i]).toFixed(1)}" x2="${x(i + 1).toFixed(1)}" y2="${y(values[i + 1]).toFixed(1)}" stroke="${segColor(i)}" stroke-width="4" stroke-linecap="round"/>`).join("")
        : "";
    const dots = points.map((p, i) => {
        const color = points.length < 2 ? "var(--primary)" : (i === 0 ? segColor(0) : segColor(i - 1));
        return `<circle cx="${x(i).toFixed(1)}" cy="${y(values[i]).toFixed(1)}" r="5" fill="${color}" stroke="var(--surface)" stroke-width="2"><title>${escapeHtml(p.label)}: ${escapeHtml(formatValue(values[i]))}</title></circle>`;
    }).join("");
    const guides = [min, min + span / 2, max].map((v) =>
        `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--border)" stroke-width="1"/>
         <text x="${W - PAD.r}" y="${(y(v) - 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--faint)">${escapeHtml(formatValue(v))}</text>`).join("");
    const ends = points.length
        ? `<text x="${PAD.l}" y="${H - 8}" font-size="11" fill="var(--faint)">${escapeHtml(points[0].label)}</text>
           <text x="${W - PAD.r}" y="${H - 8}" text-anchor="end" font-size="11" fill="var(--faint)">${escapeHtml(points[points.length - 1].label)}</text>` : "";
    return `
        <div class="trend-chart" role="img" aria-label="${escapeHtml(ariaLabel)}">
            <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" aria-hidden="true">${guides}${bars}${segments}${dots}${ends}</svg>
        </div>`;
}
/* Donut distribution (pure HTML/CSS conic segments, no dependencies).
   Segments: [{ label, value, formattedValue, color }]. Values are real
   caller data; zero totals render an empty ring with a full legend. */
export function donutChart(segments, { ariaLabel = "Donut chart" } = {}) {
    const total = segments.reduce((sum, d) => sum + (Number(d.value) || 0), 0) || 1;
    let acc = 0;
    const stops = segments.map((s) => {
        const from = (acc / total) * 100;
        acc += (Number(s.value) || 0);
        return `${s.color} ${from.toFixed(1)}% ${((acc / total) * 100).toFixed(1)}%`;
    }).join(", ");
    const legend = segments.map((s) => {
        const pct = s.pctText ?? (((Number(s.value) || 0) / total) * 100).toFixed(1);
        return `
            <div class="donut-legend-row">
                <span class="donut-legend-label"><i style="background:${s.color}" aria-hidden="true"></i>${escapeHtml(s.label)}</span>
                <span class="donut-legend-pct">${escapeHtml(pct)}${s.pctText ? "" : "%"}</span>
                <strong>${escapeHtml(s.formattedValue)}</strong>
            </div>`;
    }).join("");
    return `
        <div class="donut-wrap">
            <div class="donut" role="img" aria-label="${escapeHtml(ariaLabel)}" style="width:148px;height:148px;background:conic-gradient(${stops});">
                <span class="donut-hole" aria-hidden="true"></span>
            </div>
            <div class="donut-legend">${legend}</div>
        </div>`;
}
