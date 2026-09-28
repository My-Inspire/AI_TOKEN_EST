/* =========================================================
   Report Preview: professional analysis document rendered
   exclusively from the immutable report snapshot in the store.
   No calculation here — every figure comes from the snapshot.
   ========================================================= */

import { getReport } from "../app/store.js";
import { formatInt, formatCost, formatPercent, formatBytes } from "../utils/format.js";
import { escapeHtml, $id } from "../utils/dom.js";
import { formatDateTime } from "../utils/datetime.js";
import { donutChart } from "../components/charts.js";
import { exportReportJSON, exportReportCSV, printReport, exportReportPDF, safeDisplayCurrency } from "../services/report.js";
import { extraDetail } from "./suggestions.js";

const money = (v) => (v === null || v === undefined ? "-" : formatCost(v));
const int = (v) => (v === null || v === undefined ? "-" : formatInt(v));
const text = (v) => (v === null || v === undefined || v === "" ? "N/A" : escapeHtml(v));

/* Display currency follows the live toggle (snapshot keeps canonical
   INR) — single implementation shared with the report service. */
const displayCurrency = safeDisplayCurrency;

function secTitle(title, hint = "") {
    return `<h4 class="result-section-title rep-sec">${escapeHtml(title)}${hint ? ` <span class="rep-sec-hint">${escapeHtml(hint)}</span>` : ""}</h4>`;
}

function toolbarHtml() {
    return `
        <div class="btn-row no-print" style="margin-top:0">
            <a class="btn btn-ghost" href="#/calculator">← Back to Results</a>
            <button type="button" class="btn btn-primary" id="repPdf">Export PDF</button>
            <button type="button" class="btn btn-ghost" id="repPrint">Print</button>
            <button type="button" class="btn btn-ghost" id="repJson">Export JSON</button>
            <button type="button" class="btn btn-ghost" id="repCsv">Export CSV</button>
        </div>`;
}

function headerHtml(s) {
    const rows = [
        ["Report ID", escapeHtml(s.report.id)],
        ["Generated", escapeHtml(formatDateTime(s.report.generatedAt))],
        ["Department", escapeHtml(s.context.department)],
        ["Classification", escapeHtml(s.context.classification)],
        ["Selected model", escapeHtml(s.context.selectedModel)],
        ["Provider", escapeHtml(s.context.provider)]
    ].map(([k, v]) => `<div class="rep-meta-cell"><span>${k}</span><strong>${v}</strong></div>`).join("");
    return `
        <div class="rep-head">
            <div><p class="rep-eyebrow">AI Cost Monitor</p><h2>Token &amp; Cost Analysis Report</h2></div>
            <div class="rep-id">REPORT ${escapeHtml(s.report.id)}</div>
        </div>
        <div class="rep-meta">${rows}</div>`;
}

function execSummaryHtml(s) {
    const w = s.workload;
    const c = s.selectedModelCost;
    const tiles = [
        ["Total Input", int(w.totalInputTokens)],
        ["Output Tokens", int(w.estimatedOutputTokens)],
        ["Total Tokens", int(w.totalEstimatedTokens)],
        ["Cost / Request", money(c.totalRequestCost)],
        ["Monthly", money(c.monthlyCost)],
        ["Annual", money(c.annualCost)]
    ].map(([k, v]) => `<div class="metric-tile${k === "Monthly" ? " total" : ""}"><span>${k}</span><strong>${v}</strong></div>`).join("");
    const sv = s.savings;
    const savingLine = !sv
        ? `<div class="compare-row-line"><span class="k">Savings</span><span>No comparison data available.</span></div>`
        : sv.isAlreadyCheapest
            ? `<div class="compare-row-line"><span class="k">Savings</span><strong class="positive">Already the cheapest priced option.</strong></div>`
            : (sv.alternativeName && sv.savingMonthly !== null && sv.savingMonthly > 0)
                ? `<div class="compare-row-line"><span class="k">Cheapest alternative</span><strong>${escapeHtml(sv.alternativeName)}</strong><span>${money(sv.alternativeMonthly)}/mo</span></div>
                   <div class="compare-row-line"><span class="k">Potential saving</span><strong class="positive">${money(sv.savingMonthly)}/mo${sv.savingAnnual !== null ? ` · ${money(sv.savingAnnual)}/yr` : ""}${sv.savingPercent !== null ? ` (${formatPercent(sv.savingPercent)})` : ""}</strong></div>`
                : `<div class="compare-row-line"><span class="k">Savings</span><span>No cheaper priced alternative.</span></div>`;
    return `
        ${secTitle("Executive Summary")}
        <div class="metric-tiles">${tiles}</div>
        <div class="compare-summary" style="margin-top:0.625rem">
            <div class="compare-row-line"><span class="k">Selected model</span><strong>${escapeHtml(c.modelName)}</strong></div>
            ${savingLine}
        </div>`;
}

function workloadHtml(s) {
    const w = s.workload;
    const rows = [
        ["Prompt Tokens", int(w.promptTokens)],
        ["File Tokens", int(w.fileTokens)],
        ["Total Input Tokens", int(w.totalInputTokens)],
        ["Estimated Output Tokens", int(w.estimatedOutputTokens)],
        ["Total Estimated Tokens", int(w.totalEstimatedTokens)],
        ["Number of Files", int(w.fileCount)]
    ].map(([k, v]) => `<tr><td>${k}</td><td class="num" style="text-align:right"><strong>${v}</strong></td></tr>`).join("");
    return `${secTitle("Workload Summary")}
        <div class="ref-table-wrap"><table class="ref-table"><tbody>${rows}</tbody></table></div>`;
}

function filesHtml(s) {
    if (!s.files.length) {
        return `${secTitle("File-by-File Analysis")}<p class="cost-note">No files were uploaded for this calculation — prompt-only workload.</p>`;
    }
    const rows = s.files.map((f) => `
        <tr>
            <td>${escapeHtml(f.name)}${f.approximate ? ` <span class="badge unavailable">Approx.</span>` : ""}</td>
            <td>${escapeHtml(String(f.format).toUpperCase())}</td>
            <td class="num" style="text-align:right">${formatBytes(f.size)}</td>
            <td class="num" style="text-align:right">${f.tokens === null ? "-" : formatInt(f.tokens)}</td>
            <td><small>${text(f.method)}</small></td>
            <td>${escapeHtml(f.status)}</td>
        </tr>`).join("");
    return `${secTitle("File-by-File Analysis", `${s.files.length} file${s.files.length === 1 ? "" : "s"}`)}
        <div class="ref-table-wrap"><table class="ref-table">
            <thead><tr><th scope="col">File</th><th scope="col">Format</th><th scope="col" style="text-align:right">Size</th><th scope="col" style="text-align:right">Tokens</th><th scope="col">Method</th><th scope="col">Status</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        ${s.dataQuality.staleApproximate ? `<p class="cost-note">⚠ File totals are approximate until the backend is restarted.</p>` : ""}`;
}

function modelCostHtml(s) {
    const c = s.selectedModelCost;
    if (!c.priced) {
        return `${secTitle("Selected Model Cost Analysis")}
            <div class="cost-hero"><span>Cost unavailable</span>
            <p class="cost-note">${text(c.pricingNote)}</p></div>`;
    }
    const rows = [
        ["Model", escapeHtml(c.modelName)],
        ["Provider", escapeHtml(c.provider)],
        ["Input price", c.inputRatePer1M !== null ? `${money(c.inputRatePer1M)} / 1M` : "-"],
        ["Output price", c.outputRatePer1M !== null ? `${money(c.outputRatePer1M)} / 1M` : "-"],
        ["Input tokens", int(c.inputTokens)],
        ["Output tokens", int(c.outputTokens)],
        ["Input cost", money(c.inputCost)],
        ["Output cost", money(c.outputCost)],
        ["Total request cost", `<strong>${money(c.totalRequestCost)}</strong>`],
        ["Monthly projected cost", `<strong>${money(c.monthlyCost)}</strong>`],
        ["Annual projected cost", `<strong>${money(c.annualCost)}</strong>`],
        ...(c.gpu ? [
            ["GPU — selected", escapeHtml(c.gpu.model)],
            ["GPU hourly", c.gpu.hourlyCost !== null ? `${money(c.gpu.hourlyCost)}/hr (${escapeHtml(c.gpu.pricingTier || "onDemand")})` : "-"],
            ["GPU monthly", c.gpu.monthlyCost !== null ? `<strong>${money(c.gpu.monthlyCost)}</strong>` : "-"],
            ["Combined monthly (API + GPU)", c.totalMonthlyCost !== null ? `<strong>${money(c.totalMonthlyCost)}</strong>` : "-"],
            ["Combined annual (API + GPU)", c.totalAnnualCost !== null ? `<strong>${money(c.totalAnnualCost)}</strong>` : "-"]
        ] : [])
    ].map(([k, v]) => `<tr><td>${k}</td><td class="num" style="text-align:right">${v}</td></tr>`).join("");
    return `${secTitle("Selected Model Cost Analysis")}
        <div class="ref-table-wrap"><table class="ref-table"><tbody>${rows}</tbody></table></div>`;
}

function distributionHtml(s) {
    const w = s.workload;
    const total = (w.promptTokens || 0) + (w.fileTokens || 0) + (w.estimatedOutputTokens || 0);
    const parts = [
        ["Prompt tokens", w.promptTokens || 0, "var(--primary)"],
        ["File tokens", w.fileTokens || 0, "var(--success)"],
        ["Output tokens", w.estimatedOutputTokens || 0, "var(--chart-purple)"]
    ].map(([label, value, color]) => ({
        label,
        value,
        color,
        formattedValue: formatInt(value),
        pctText: total > 0 ? ((value / total) * 100).toFixed(1) : "0.0"
    }));
    return `${secTitle("Token Distribution")}
        ${donutChart(parts, { ariaLabel: `Token distribution: prompt, file and output shares of ${formatInt(total)} tokens` })}`;
}

function comparisonHtml(s) {
    if (!s.comparison.length) {
        return `${secTitle("Model Comparison")}<p class="cost-note">No comparison data available.</p>`;
    }
    const rows = s.comparison.map((r) => {
        const diff = r.difference === null ? "<strong>—</strong>"
            : r.difference === 0 ? "<strong>Selected</strong>"
                : `<strong class="${r.difference > 0 ? "negative" : "positive"}">${r.difference > 0 ? "+" : "−"}${formatCost(Math.abs(r.difference))}</strong>`
                    + `<br><small>${formatPercent(Math.abs(r.differencePct || 0))} ${r.difference > 0 ? "more" : "less"}</small>`;
        return `
        <tr${r.selected ? ' class="rep-selected"' : ""}>
            <td>${escapeHtml(r.modelName)}${r.selected ? ' <span class="badge rep-badge-selected">Selected</span>' : ""}${r.priced ? "" : ' <span class="badge unavailable">Unpriced</span>'}</td>
            <td>${escapeHtml(r.provider)}</td>
            <td class="num" style="text-align:right">${money(r.requestCost)}</td>
            <td class="num" style="text-align:right">${money(r.monthlyCost)}</td>
            <td class="num" style="text-align:right">${diff}</td>
            <td class="num" style="text-align:right">${int(r.rank)}</td>
        </tr>`;
    }).join("");
    return `${secTitle("Model Comparison", `${s.comparison.length} models`)}
        <div class="ref-table-wrap"><table class="ref-table">
            <thead><tr><th scope="col">Model</th><th scope="col">Provider</th><th scope="col" style="text-align:right">Request Cost</th><th scope="col" style="text-align:right">Monthly Cost</th><th scope="col" style="text-align:right">Difference</th><th scope="col" style="text-align:right">Rank</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>`;
}

function rankingRow(r) {
    return `<div class="scenario-row"><div class="scenario-label"><strong>#${r.rank} ${escapeHtml(r.modelName)}</strong><small>${escapeHtml(r.provider)}</small></div>
        <div class="scenario-costs"><div><span>Monthly</span><strong>${money(r.monthlyCost)}</strong></div></div></div>`;
}

function rankingsHtml(s) {
    const { lowest, highest, selectedRank, totalRanked } = s.rankings;
    if (!lowest.length) return `${secTitle("Cost Ranking")}<p class="cost-note">No priced models to rank.</p>`;
    return `${secTitle("Cost Ranking")}
        <p class="opt-action-label">Lowest cost models</p>
        <div class="scenario-table">${lowest.map(rankingRow).join("")}</div>
        <p class="opt-action-label">Highest cost models</p>
        <div class="scenario-table">${highest.map(rankingRow).join("")}</div>
        <div class="compare-summary" style="margin-top:0.625rem">
            <div class="compare-row-line"><span class="k">Selected model ranking</span><strong>${selectedRank !== null ? `#${selectedRank} of ${totalRanked} models` : "Unranked (pricing unavailable)"}</strong></div>
        </div>`;
}

function savingsHtml(s) {
    const sv = s.savings;
    if (!sv) return `${secTitle("Savings Analysis")}<p class="cost-note">No comparison data available.</p>`;
    if (sv.isAlreadyCheapest || sv.savingMonthly === null || sv.savingMonthly <= 0) {
        return `${secTitle("Savings Analysis")}
            <div class="opt-hero"><span>Selected model</span><strong>${money(sv.currentMonthly)} / month</strong></div>
            <p class="cost-note">${sv.isAlreadyCheapest ? "Your selection is already the cheapest priced option — no saving available." : "No cheaper priced alternative for this workload."}</p>`;
    }
    return `${secTitle("Savings Analysis")}
        <div class="impact-strip">
            <div class="impact-cell"><span>Selected model / mo</span><strong>${money(sv.currentMonthly)}</strong></div>
            <div class="impact-cell"><span>${escapeHtml(sv.alternativeName || "Alternative")} / mo</span><strong>${money(sv.alternativeMonthly)}</strong></div>
            <div class="impact-cell highlight"><span>Save</span><strong>${money(sv.savingMonthly)}${sv.savingPercent !== null ? ` (${formatPercent(sv.savingPercent)})` : ""}</strong></div>
        </div>
        <div class="compare-summary" style="margin-top:0.625rem">
            <div class="compare-row-line"><span class="k">Potential saving</span><strong class="positive">${money(sv.savingMonthly)}/mo · ${money(sv.savingAnnual)}/yr</strong></div>
        </div>`;
}

function scenariosHtml(s) {
    if (!s.scenarios.length) return `${secTitle("Scenario Analysis")}<p class="cost-note">No scenario data available.</p>`;
    const rows = s.scenarios.map((sc) => `
        <div class="scenario-row">
            <div class="scenario-label"><strong>${escapeHtml(sc.label)}</strong><small>${formatInt(sc.monthlyRequests)} requests/month</small></div>
            <div class="scenario-costs">
                <div><span>Per request</span><strong>${money(sc.costPerRequest)}</strong></div>
                <div><span>Monthly</span><strong>${money(sc.monthlyCost)}</strong></div>
                <div><span>Annual</span><strong>${money(sc.annualCost)}</strong></div>
            </div>
        </div>`).join("");
    return `${secTitle("Scenario Analysis", "existing presets")}<div class="scenario-table">${rows}</div>`;
}

function recommendationsHtml(s) {
    const rec = s.recommendations;
    if (!rec || !rec.items?.length) {
        return `${secTitle("Optimization Recommendations")}<p class="cost-note">No recommendations available for this calculation.</p>`;
    }
    const items = rec.items.map((item) => `
        <div class="suggest-item ${escapeHtml(item.type || "info")}">
            <span aria-hidden="true">•</span>
            <div><strong>${escapeHtml(item.title || "Recommendation")}</strong>
            ${item.data?.savings != null ? `<p>Potential saving: ${money(item.data.savings)}${item.data.savingsAnnual != null ? ` / month · ${money(item.data.savingsAnnual)} / year` : " / month"}</p>` : ""}
            ${extraDetail(item)}</div>
        </div>`).join("");
    return `${secTitle("Optimization Recommendations", `${rec.items.length} item${rec.items.length === 1 ? "" : "s"}`)}
        <div class="suggest-list">${items}</div>`;
}

function methodologyHtml(s) {
    const gpu = s?.selectedModelCost?.gpu || s?.context?.gpuReference || null;
    const gpuBlock = gpu && gpu.status === "Selected"
        ? `<div class="opt-action" style="margin-top:0.5rem">
            <strong>GPU Infrastructure — ${escapeHtml(gpu.model)}</strong>
            <small>IndiaAI ${escapeHtml(gpu.pricingTier || "onDemand")} at ${gpu.hourlyCost !== null ? `${money(gpu.hourlyCost)}/hr` : "listed rate"} · ${gpu.runtimeHours ?? "-"} hrs/day. GPU monthly ${gpu.monthlyCost !== null ? money(gpu.monthlyCost) : "-"} is added to the API estimate for combined totals.</small>
        </div>`
        : `<div class="opt-action" style="margin-top:0.5rem">
            <strong>GPU Reference — NVIDIA H100</strong>
            <small>Status: placeholder reference only. GPU costing is not included in the current AI cost calculation.</small>
        </div>`;
    return `${secTitle("Calculation Methodology")}
        <div class="opt-action">
            <strong>Total Input Tokens = Prompt Tokens + File Tokens</strong>
            <small>Estimated request cost is derived from the selected model's configured input/output pricing and the calculated token usage above. Monthly cost is request cost × monthly requests; annual cost is monthly × 12. Token counts are provider-calibrated estimates, not exact tokenizer outputs — billed usage may differ slightly.</small>
        </div>
        ${gpuBlock}`;
}

function dataQualityHtml(s) {
    const q = s.dataQuality;
    const lines = [];
    if (!q.hasFiles) lines.push(`<div class="compare-row-line"><span class="k">Files</span><span>Prompt-only workload — no file parsing involved.</span></div>`);
    else if (q.allParsed && !q.staleBackend) lines.push(`<div class="compare-row-line"><span class="k">Files</span><strong class="positive">✓ All uploaded files parsed successfully.</strong></div>`);
    for (const w of q.warnings) {
        lines.push(`<div class="compare-row-line"><span class="k">⚠ ${escapeHtml(w.file)}</span><span>${escapeHtml(w.warning)}</span></div>`);
    }
    if (q.fallbackFiles.length) {
        lines.push(`<div class="compare-row-line"><span class="k">⚠ Approximate estimation used for</span><span>${q.fallbackFiles.map(escapeHtml).join(", ")}</span></div>`);
    }
    if (q.staleBackend) {
        lines.push(`<div class="compare-row-line"><span class="k">⚠ Calculation backend is outdated.</span><span>File totals are approximate until the backend is restarted.</span></div>`);
    }
    return `${secTitle("Data Quality / Warnings")}<div class="compare-summary">${lines.join("")}</div>`;
}

function pricingHtml(s) {
    const p = s.pricing;
    /* Currency follows the display toggle like every rendered figure
       (snapshot keeps canonical INR for JSON interchange). */
    const rows = [
        ["Provider", text(p.provider)],
        ["Model", text(p.model)],
        ["Input pricing", p.inputRatePer1M !== null ? `${money(p.inputRatePer1M)} / 1M tokens` : "-"],
        ["Output pricing", p.outputRatePer1M !== null ? `${money(p.outputRatePer1M)} / 1M tokens` : "-"],
        ["Currency", escapeHtml(displayCurrency())],
        ["Pricing reference", p.source ? `<a href="${escapeHtml(p.source)}" target="_blank" rel="noopener">${escapeHtml(p.source)}</a>` : "N/A"],
        ["Pricing updated", p.lastUpdated ? escapeHtml(p.lastUpdated) : "N/A"],
        ["Catalogue version", text(p.version)]
    ].map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right">${v}</td></tr>`).join("");
    return `${secTitle("Pricing Reference")}
        <div class="ref-table-wrap"><table class="ref-table"><tbody>${rows}</tbody></table></div>`;
}

export function render() {
    const snapshot = getReport();
    const head = `
        <div class="view-head">
            <h2>Report</h2>
            <p>Generated analysis document from your latest calculation.</p>
        </div>`;
    if (!snapshot) {
        return `${head}
        <section class="card narrow">
            <p><strong>No report yet.</strong> <span style="color:var(--muted)">Run a calculation, then choose Generate Report on the results page.</span></p>
            <div class="btn-row"><a class="btn btn-primary" href="#/calculator">Open Calculator</a></div>
        </section>`;
    }
    return `${head}
    <div class="calc-layout" style="grid-template-columns:minmax(0,1fr)">
        <section class="panel rep-doc" aria-label="Generated cost report">
            ${toolbarHtml()}
            <div class="result-section">${headerHtml(snapshot)}</div>
            <div class="result-section">${execSummaryHtml(snapshot)}</div>
            <div class="result-section">${workloadHtml(snapshot)}</div>
            <div class="result-section">${filesHtml(snapshot)}</div>
            <div class="result-section">${modelCostHtml(snapshot)}</div>
            <div class="result-section">${distributionHtml(snapshot)}</div>
            <div class="result-section">${comparisonHtml(snapshot)}</div>
            <div class="result-section">${rankingsHtml(snapshot)}</div>
            <div class="result-section">${savingsHtml(snapshot)}</div>
            <div class="result-section">${scenariosHtml(snapshot)}</div>
            <div class="result-section">${recommendationsHtml(snapshot)}</div>
            <div class="result-section">${methodologyHtml(snapshot)}</div>
            <div class="result-section">${dataQualityHtml(snapshot)}</div>
            <div class="result-section">${pricingHtml(snapshot)}</div>
        </section>
    </div>`;
}

export function mount() {
    $id("repPdf")?.addEventListener("click", () => exportReportPDF(getReport()));
    $id("repPrint")?.addEventListener("click", () => printReport());
    $id("repJson")?.addEventListener("click", () => exportReportJSON(getReport()));
    $id("repCsv")?.addEventListener("click", () => exportReportCSV(getReport()));
}
