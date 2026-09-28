/* =========================================================
   Dashboard: cost-intelligence command center. KPI overview,
   executive hero, optimizer, usage distribution and side
   fixation — every figure comes from the live store (never
   hardcoded). Purposeful intro when empty.
   ========================================================= */

import { getStore, getActivity, getTrend } from "../app/store.js";
import { formatInt, formatCost } from "../utils/format.js";
import { escapeHtml } from "../utils/dom.js";
import { timeAgo, formatTime, currentMonthRange } from "../utils/datetime.js";
import { statCard } from "../components/stat-card.js";
import { icon } from "../components/icons.js";
import { donutChart, trendComboChart } from "../components/charts.js";
import { quickFixPanel } from "../components/quick-fix.js";
import { getCachedModels } from "../services/api.js";
import { SERVICE_CATEGORIES } from "../data/config.js";

function workflowStrip() {
    const steps = [
        ["doc", "Workload"],
        ["chart", "Tokens"],
        ["calculator", "Cost"],
        ["suggest", "Optimization"]
    ];
    return `<div class="flow-strip" aria-label="Workflow: workload, tokens, cost, optimization">` +
        steps.map(([ic, label], i) => `
            ${i > 0 ? '<span class="flow-arrow" aria-hidden="true">→</span>' : ""}
            <div class="flow-step">${icon(ic)}${label}</div>`).join("") +
        `</div>`;
}

function introHtml() {
    return `
        <section class="card hero-card hero-intro">
            <div class="hero-main">
                <p class="hero-eyebrow">AI Cost Monitor · Estimate before you spend</p>
                <h3 class="hero-title">Know what every request costs.</h3>
                <div class="btn-row hero-actions">
                    <a class="btn btn-primary" href="#/calculator">New Calculation <span class="btn-arrow" aria-hidden="true">→</span></a>
                    <a class="btn hero-ghost" href="#/help">How it works</a>
                </div>
            </div>
        </section>
        <section class="card">
            <div class="panel-head"><p class="card-eyebrow">Workflow</p><h3>From workload to decision in four steps</h3></div>
            ${workflowStrip()}
        </section>`;
}

function heroHtml(result, summary, inputs) {
    const period = currentMonthRange().label;
    const cat = SERVICE_CATEGORIES.find((c) => c.id === inputs?.serviceCategory);
    const infra = result.hasInfrastructure && result.infrastructureCost ? result.infrastructureCost : null;
    const headline = result.priced && result.monthlyCost !== null ? formatCost(result.monthlyCost) : "—";
    const annual = result.priced && result.annualCost !== null ? `${formatCost(result.annualCost)} / year` : "Pricing unavailable";
    const chips = [
        `<span class="chip"><i class="chip-dot" aria-hidden="true"></i>${escapeHtml(result.modelName || "Unknown model")}</span>`,
        `<span class="chip">${escapeHtml(cat ? cat.name : (inputs?.serviceCategory || "Unclassified"))}</span>`,
        infra
            ? `<span class="chip chip-gpu">${escapeHtml(infra.gpu || "GPU")} · ${formatCost(infra.monthlyInfrastructureCost)}/mo</span>`
            : `<span class="chip chip-muted">API cost only</span>`,
        result.isArchived ? `<span class="chip chip-warn">Archived · historical</span>` : ""
    ].join("");
    return `
        <section class="card hero-card hero-live" aria-label="Executive summary">
            <div class="hero-main">
                <p class="hero-eyebrow">Executive summary · ${escapeHtml(period)}</p>
                <h3 class="hero-title"><span class="hero-amount">${headline}</span><span class="hero-per"> / month</span></h3>
                <p class="hero-sub">${escapeHtml(annual)} · ${formatInt(result.monthlyRequests)} requests · ${formatInt(result.totalTokens)} tokens per request</p>
                <div class="chip-row">${chips}</div>
                <div class="btn-row hero-actions">
                    <a class="btn btn-primary" href="#/calculator">New Calculation <span class="btn-arrow" aria-hidden="true">→</span></a>
                    <a class="btn hero-ghost" href="#/report">View Report</a>
                    <a class="btn hero-ghost" href="#/comparison">Compare</a>
                </div>
            </div>
            <div class="hero-side">
                <div class="hero-mini"><div><span>Cost / request</span><strong>${result.priced ? formatCost(result.costPerRequest) : "—"}</strong></div></div>
                <div class="hero-mini"><div><span>Total tokens</span><strong>${formatInt(result.totalTokens)}</strong></div></div>
                <div class="hero-mini"><div><span>Blended / 1M</span><strong>${result.costPer1MTokens !== null ? formatCost(result.costPer1MTokens) : "—"}</strong></div></div>
            </div>
        </section>`;
}

function kpiHtml(result) {
    const per1K = result.costPer1KTokens !== null ? `${formatCost(result.costPer1KTokens)} / 1K` : "-";
    return `
        <div class="grid-4 kpi-grid">
            ${statCard({ label: "Monthly Cost", value: result.priced ? formatCost(result.monthlyCost) : "—", hint: result.priced ? `${formatCost(result.annualCost)} / year` : "Pricing unavailable", accent: "accent", iconSvg: icon("calculator") })}
            ${statCard({ label: "Cost / Request", value: result.priced ? formatCost(result.costPerRequest) : "—", hint: per1K, accent: "teal", iconSvg: icon("chart") })}
            ${statCard({ label: "Total Tokens", value: formatInt(result.totalTokens), hint: `In ${formatInt(result.inputTokens)} · Out ${formatInt(result.outputTokens)}`, accent: "violet", iconSvg: icon("doc") })}
            ${statCard({ label: "Total Requests", value: formatInt(result.monthlyRequests), hint: "requests / month", accent: "amber", iconSvg: icon("reports") })}
        </div>`;
}

function infraBannerHtml(result) {
    const infra = result.hasInfrastructure && result.infrastructureCost ? result.infrastructureCost : null;
    if (!infra) return "";
    return `
        <section class="infra-banner" aria-label="Infrastructure cost">
            <span class="infra-ico" aria-hidden="true">${icon("panel")}</span>
            <div class="infra-main">
                <strong>${escapeHtml(infra.gpu || "GPU infrastructure")} · ${formatCost(infra.monthlyInfrastructureCost)}/mo</strong>
                <small>${infra.hourlyCost !== null ? `${formatCost(infra.hourlyCost)}/hr · ` : ""}${infra.runtimeHours ?? "-"} hrs/day · On-demand IndiaAI rates</small>
            </div>
            <div class="infra-total"><span>Combined / month</span><strong>${result.totalMonthlyCost !== null ? formatCost(result.totalMonthlyCost) : "—"}</strong></div>
        </section>`;
}

/* Session trend metric toggle (module-session state, like the view). */
let trendMetric = "cost";

function trendHtml() {
    const history = getTrend();
    const usable = trendMetric === "tokens"
        ? history
        : history.filter((p) => Number.isFinite(p.monthlyCost));
    const toggle = `
        <div class="seg seg-compact" role="group" aria-label="Trend metric">
            <button type="button" data-trend-metric="cost" aria-pressed="${trendMetric === "cost"}">Cost</button>
            <button type="button" data-trend-metric="tokens" aria-pressed="${trendMetric === "tokens"}">Tokens</button>
        </div>`;
    let body;
    if (usable.length < 2) {
        body = `
            <div class="dash-empty dash-empty-illustrated">
                <span class="empty-ico" aria-hidden="true">${icon("chart")}</span>
                <strong>No trend history yet</strong>
                <p>Run at least two calculations — each one adds a real point to this chart. Nothing is fabricated.</p>
                <div class="btn-row"><a class="btn btn-ghost" href="#/calculator">Open Calculator</a></div>
            </div>`;
    } else {
        const isCost = trendMetric !== "tokens";
        body = `
            <div class="chart-frame">
            ${trendComboChart(usable.map((p) => ({
                value: isCost ? p.monthlyCost : p.totalTokens,
                label: formatTime(p.ts)
            })), {
                formatValue: (v) => isCost ? formatCost(v) : formatInt(v),
                ariaLabel: isCost ? "Monthly cost trend across session calculations" : "Token usage trend across session calculations"
            })}
            </div>
            <p class="chart-foot">${usable.length} real calculation${usable.length === 1 ? "" : "s"} this session · ${escapeHtml(formatTime(usable[0].ts))} → ${escapeHtml(formatTime(usable[usable.length - 1].ts))}</p>`;
    }
    return `
        <section class="card">
            <div class="card-head-row"><div class="panel-head"><p class="card-eyebrow">Trajectory</p><h3>Cost Trend</h3><p>Monthly cost and token usage trend</p></div></div>
            <div class="trend-toggle">${toggle}</div>
            ${body}
        </section>`;
}

function optimizerHtml(result, summary) {
    const support = summary?.decisionSupport;
    let body;
    if (support && support.potentialMonthlySaving > 0 && support.alternativeModelName) {
        const pct = result.monthlyCost > 0 ? Math.min((support.potentialMonthlySaving / result.monthlyCost) * 100, 100) : 0;
        body = `
            <div class="save-hero"><span>Save up to</span><strong>${formatCost(support.potentialMonthlySaving)} / month</strong><small>${formatCost(support.potentialAnnualSaving)} / year · ${pct.toFixed(1)}% lower</small></div>
            <div class="save-bar" role="img" aria-label="Potential saving of ${pct.toFixed(1)} percent"><i style="width:${pct.toFixed(1)}%"></i></div>
            <p class="opt-action-label">Recommended Action</p>
            <div class="opt-action opt-action-highlight"><strong>Switch to ${escapeHtml(support.alternativeModelName)}</strong><small>Lower monthly cost for this workload</small><div class="btn-row"><a class="btn btn-ghost" href="#/comparison">Review in Comparison</a></div></div>`;
    } else if (support?.isAlreadyCheapest) {
        body = `<div class="dash-empty dash-empty-illustrated"><span class="empty-ico empty-ico-ok" aria-hidden="true">✓</span><strong>Already optimal</strong><p>${escapeHtml(result.modelName)} is the cheapest priced option for this workload.</p></div>`;
    } else {
        body = `<div class="dash-empty dash-empty-illustrated"><span class="empty-ico" aria-hidden="true">${icon("suggest")}</span><strong>No optimization recommendation available yet.</strong><p>Calculate a workload to unlock model recommendations with quantified savings.</p></div>`;
    }
    return `
        <section class="card">
            <div class="card-head-row"><div class="panel-head"><p class="card-eyebrow">Efficiency</p><h3>Cost Optimizer</h3><p>Potential savings with better model selection and usage optimization</p></div></div>
            ${body}
        </section>`;
}

/* Cost ranking for Model Usage. Comparison rows arrive cheapest-first,
   so re-sort by DESCENDING monthlyCost (canonical INR — display
   currency never affects ranking). The SELECTED model always leads in
   red; the next three priciest take green/blue/yellow; everything else
   combines into one purple "Other Models (N)" bucket. Zero/non-finite
   costs are excluded from the ranking; percentages derive from raw
   values at render time. */
const USAGE_TOP_N = 4;
const USAGE_SELECTED_COLOR = "var(--danger)";
const USAGE_COMPARE_COLORS = ["var(--success)", "var(--primary)", "var(--warning)"];
const USAGE_OTHER_COLOR = "var(--chart-purple)";

function rankUsageRows(comparisonRows, selectedModelId, topN = USAGE_TOP_N) {
    const priced = (comparisonRows || []).filter((r) =>
        r && r.priced && Number.isFinite(r.monthlyCost) && r.modelName && r.modelId);
    const ranked = priced
        .filter((r) => r.monthlyCost > 0)
        .sort((a, b) => b.monthlyCost - a.monthlyCost);
    const selected = selectedModelId
        ? (ranked.find((r) => r.modelId === selectedModelId)
            || priced.find((r) => r.modelId === selectedModelId)
            || null)
        : null;
    const rest = ranked.filter((r) => r !== selected);
    const head = [...(selected ? [selected] : []), ...rest].slice(0, topN);
    const tail = [...(selected ? [selected] : []), ...rest].slice(topN);
    let compareIdx = 0;
    const segments = head.map((r) => {
        const isSelected = r === selected;
        const hasCost = r.monthlyCost > 0;
        const color = isSelected
            ? USAGE_SELECTED_COLOR
            : (USAGE_COMPARE_COLORS[compareIdx++] || USAGE_OTHER_COLOR);
        return {
            label: r.modelName, value: hasCost ? r.monthlyCost : 0,
            formattedValue: hasCost ? formatCost(r.monthlyCost) : "—",
            pctText: hasCost ? undefined : "—",
            color
        };
    });
    if (tail.length) {
        const otherTotal = tail.reduce((s, r) => s + r.monthlyCost, 0);
        segments.push({
            label: `Other Models (${tail.length})`,
            value: otherTotal,
            formattedValue: formatCost(otherTotal),
            color: USAGE_OTHER_COLOR
        });
    }
    return { segments, hasPriced: priced.length > 0 };
}

function usageHtml(comparisonRows) {
    /* Group-aware distribution: an archived selection ranks the archived
       universe, otherwise the active leaderboard rows. */
    const store = getStore();
    const selectedIsArchived = store.comparisonSummary?.selectedRow?.isArchived
        ?? store.result?.isArchived ?? false;
    const dataset = selectedIsArchived ? (store.archivedRows || []) : comparisonRows;
    const selectedModelId = store.comparisonSummary?.selectedRow?.modelId
        ?? store.result?.modelId ?? null;
    const { segments, hasPriced } = rankUsageRows(dataset, selectedModelId);
    if (!segments.length) {
        return `
        <section class="card">
            <div class="panel-head"><p class="card-eyebrow">Mix</p><h3>Model Usage</h3><p>Cost distribution across different AI models</p></div>
            <div class="dash-empty"><strong>${hasPriced ? "No cost to distribute." : "No distribution data yet."}</strong><p>${hasPriced ? "Every priced model estimates zero cost for this workload — nothing to rank." : "Re-run the calculation to refresh the distribution."}</p></div>
        </section>`;
    }
    const pricedCount = segments.length;
    return `
        <section class="card">
            <div class="card-head-row">
                <div class="panel-head"><p class="card-eyebrow">Mix</p><h3>Model Usage</h3><p>Cost distribution across different AI models</p></div>
                <span class="count-pill">${pricedCount} shown</span>
            </div>
            ${donutChart(segments, { ariaLabel: "Monthly cost share by model for the current workload" })}
            <p class="chart-foot">Shares of monthly cost · your selection leads in red</p>
        </section>`;
}

function activityHtml() {
    const items = getActivity();
    if (!items.length) {
        return `
        <section class="card">
            <div class="panel-head"><p class="card-eyebrow">Audit</p><h3>Recent Activity</h3><p>Latest calculations and uploads</p></div>
            <div class="dash-empty"><strong>No recent activity yet.</strong><p>Run a calculation or upload a file — it appears here with its real time.</p></div>
        </section>`;
    }
    const rows = items.map((a) => `
        <div class="act-row">
            <span class="act-ico" aria-hidden="true">${icon(a.type === "upload" ? "upload" : "calculator")}</span>
            <div class="act-main">
                <strong>${escapeHtml(a.title)}</strong>
                <small>${escapeHtml(a.detail)}</small>
            </div>
            <div class="act-side">
                <span class="estimation-badge">${escapeHtml(a.status)}</span>
                <small class="act-time">${escapeHtml(timeAgo(a.ts))}</small>
            </div>
        </div>`).join("");
    return `
        <section class="card">
            <div class="card-head-row">
                <div class="panel-head"><p class="card-eyebrow">Audit</p><h3>Recent Activity</h3><p>Latest calculations and uploads</p></div>
                <span class="count-pill">${items.length} event${items.length === 1 ? "" : "s"}</span>
            </div>
            <div class="act-list act-timeline">${rows}</div>
        </section>`;
}

function fixationHtml() {
    const { result, comparisonSummary, inputs } = getStore();
    if (!result) return `<div class="dash-side">${quickFixPanel()}</div>`;
    const cat = SERVICE_CATEGORIES.find((c) => c.id === inputs?.serviceCategory);
    const meta = getCachedModels()?.models.find((m) => m.id === result.modelId);
    const support = comparisonSummary?.decisionSupport;
    const infra = result.hasInfrastructure && result.infrastructureCost ? result.infrastructureCost : null;
    return `<div class="dash-side">${quickFixPanel({
        classification: cat ? cat.name : "-",
        model: result.modelName || "-",
        tokens: formatInt(result.totalTokens),
        cost: formatCost(result.costPerRequest),
        performance: meta?.contextWindow ? `${formatInt(meta.contextWindow)} ctx` : "-",
        insight: (support && support.potentialMonthlySaving > 0 && support.alternativeModelName)
            ? `Potential saving ${formatCost(support.potentialMonthlySaving)}/mo with ${support.alternativeModelName} — see Comparison.`
            : (infra
                ? `GPU ${infra.gpu} at ${formatCost(infra.monthlyInfrastructureCost)}/mo brings combined spend to ${formatCost(result.totalMonthlyCost)}/mo.`
                : "See Comparison and Suggestions for optimization.")
    })}
        <section class="card fix-cta">
            <strong>Take the next step</strong>
            <p>Freeze this estimate into a shareable report or race it against every model.</p>
            <div class="btn-row">
                <a class="btn btn-primary" href="#/report">View Report</a>
                <a class="btn btn-ghost" href="#/comparison">Compare</a>
            </div>
        </section>
    </div>`;
}

export function render() {
    const { result, comparisonRows, comparisonSummary, inputs } = getStore();
    const head = `
        <div class="view-head dash-head">
            <h2>Command Center</h2>
        </div>`;
    if (!result) return `${head}<div class="stack dash-intro">${introHtml()}</div>`;

    return `
        ${head}
        ${heroHtml(result, comparisonSummary, inputs)}
        <div class="dash-layout">
            <div class="stack">
                ${kpiHtml(result)}
                ${infraBannerHtml(result)}
                <div class="dash-duo">
                    ${trendHtml()}
                    ${optimizerHtml(result, comparisonSummary)}
                </div>
                <div class="dash-duo">
                    ${usageHtml(comparisonRows)}
                    ${activityHtml()}
                </div>
            </div>
            ${fixationHtml()}
        </div>`;
}

function wireTrendToggle(root = document) {
    root.querySelectorAll?.("[data-trend-metric]").forEach((button) => {
        button.addEventListener("click", () => {
            if (trendMetric === button.dataset.trendMetric) return;
            trendMetric = button.dataset.trendMetric;
            const outlet = document.getElementById("view");
            if (outlet && (window.location.hash || "#/dashboard") === "#/dashboard") {
                outlet.innerHTML = render();
                wireTrendToggle(outlet);
            }
        });
    });
}

export function mount() {
    const rerender = () => {
        if ((window.location.hash || "#/dashboard") !== "#/dashboard") return;
        const outlet = document.getElementById("view");
        if (outlet) {
            outlet.innerHTML = render();
            wireTrendToggle(outlet);
        }
    };
    window.addEventListener("estimate:updated", rerender, { once: true });
    wireTrendToggle();
}
