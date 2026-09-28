/* =========================================================
   Suggestions: optimization workspace. Recommendation data
   arrives structured from the backend; all money is
   formatted here (display-currency aware).
   ========================================================= */

import { getStore } from "../app/store.js";
import { formatCost, formatPercent, formatInt } from "../utils/format.js";
import { escapeHtml } from "../utils/dom.js";

const ICONS = {
    optimization: "⚡",
    savings: "💰",
    info: "ℹ️",
    warning: "⚠️",
    insight: "💡"
};

function impactStrip(data) {
    return `
        <div class="impact-strip" aria-label="Cost impact">
            <div class="impact-cell"><span>Current / mo</span><strong>${formatCost(data.currentMonthly)}</strong></div>
            <div class="impact-cell"><span>With ${escapeHtml(data.alternativeModelName)}</span><strong>${formatCost(data.alternativeMonthly)}</strong></div>
            <div class="impact-cell highlight"><span>Save</span><strong>${formatCost(data.savings)} (${formatPercent(data.savingsPercent)})</strong></div>
        </div>`;
}

/* Shared with the Report preview (reuses the same detail copy). */
export function extraDetail(item) {
    const data = item.data || {};
    switch (item.detail) {
        case "unit-economics":
            return `<p>Blended unit economics: about ${formatCost(data.costPer1MTokens)} per 1M total tokens and ${formatCost(data.costPer1KTokens)} per 1K tokens.</p>`;
        case "cached-input":
            return `<p>Cached input is published for this model — worth testing before switching providers.</p>`;
        case "infra-included":
            return `<p>Infrastructure at ${formatCost(data.infraMonthly)}/mo brings the operating estimate to ${formatCost(data.totalMonthly)}/mo.</p>`;
        case "input-heavy":
            return `<p>${data.inputPercent.toFixed(0)}% of tokens are input — prompt compression and caching dominate here.</p>`;
        case "output-heavy":
            return `<p>${data.outputPercent.toFixed(0)}% of tokens are output — compare models on output-token cost.</p>`;
        case "high-volume":
            return `<p>At ${formatInt(data.monthlyRequests)} requests/month, reserved or batch pricing may beat list price.</p>`;
        default:
            return "";
    }
}

function titleFor(item) {
    if (item.type === "savings" && item.data) {
        return `Potential Monthly Savings: ${formatCost(item.data.savings)} (${formatPercent(item.data.savingsPercent)})`;
    }
    return item.title;
}

function itemHtml(item, index) {
    const stagger = index < 3 ? ` reveal reveal-${index}` : "";
    const strip = item.type === "savings" && item.data ? impactStrip(item.data) : "";
    return `
        <div class="suggest-item ${item.type} ${item.priority}${stagger}">
            <span aria-hidden="true">${ICONS[item.type] || "•"}</span>
            <div><strong>${escapeHtml(titleFor(item))}</strong>${strip}<p>${escapeHtml(item.message)}</p>${extraDetail(item)}</div>
        </div>`;
}

function summaryHtml(rec, result) {
    const s = rec.summary || {};
    if (s.hasSaving) {
        return `<strong>Current: ${formatCost(s.currentMonthly)}/mo → Cheapest alternative: ${formatCost(s.cheapestMonthly)}/mo (${escapeHtml(s.cheapestModelName || "")}). Potential saving: ${formatCost(s.savingsMonthly)}/mo (${formatCost(s.savingsAnnual)}/yr).</strong>`;
    }
    if (result.priced) {
        return `<strong>Current estimate: ${formatCost(result.monthlyCost)}/mo. No cheaper priced alternative found for this workload.</strong>`;
    }
    return `<strong>${escapeHtml(rec.items?.[0]?.message || "Pricing unavailable for this model.")}</strong>`;
}

export function render() {
    const head = `
        <div class="view-head">
            <h2>Suggestions</h2>
        </div>`;
    const { result, recommendation } = getStore();
    if (!result || !recommendation) {
        return `${head}
        <section class="card">
            <div class="panel-head">
                <h3>Turn this estimate into a decision</h3>
                <p>Calculate a workload to unlock workload-aware recommendations with quantified monthly and annual savings.</p>
            </div>
            <div class="btn-row" style="margin-top:0">
                <a class="btn btn-primary" href="#/calculator">Get Suggestions <span class="btn-arrow" aria-hidden="true">→</span></a>
            </div>
        </section>`;
    }
    const items = (recommendation.items || []).map((item, i) => itemHtml(item, i)).join("");
    return `${head}
        <section class="card narrow" data-results>
            <p class="suggest-summary">${summaryHtml(recommendation, result)}</p>
            <div class="suggest-list">${items}</div>
        </section>`;
}

export function mount() { /* static view */ }
