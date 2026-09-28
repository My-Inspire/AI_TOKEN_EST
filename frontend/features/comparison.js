/* =========================================================
   Smart Compare: AI-style verdict + top picks + friendly
   filters over the same cheapest-first leaderboard.
   Backend data (rows/summary/recommendation) untouched —
   this file is presentation only.
   ========================================================= */

import { getStore } from "../app/store.js";
import { formatInt, formatCost, formatPerMillion, formatPercent } from "../utils/format.js";
import { escapeHtml, $id } from "../utils/dom.js";

const INITIAL_ROWS = 15;
let expanded = false;
let query = "";
let providerFilter = "all";
let sortMode = "cheap";

const MEDALS = ["🥇", "🥈", "🥉"];

function badges(row, bestId, selectedId) {
    let html = "";
    if (row.modelId === bestId) html += '<span class="badge best">Best value</span>';
    if (row.modelId === selectedId) html += '<span class="badge current">Current</span>';
    if (!row.priced) html += '<span class="badge unavailable">Pricing unavailable</span>';
    return html ? `<div class="badges">${html}</div>` : "";
}

/* Explainable "AI verdict": pure rules over the priced rows —
   no black box, every claim traces to a number below. */
function buildVerdict(summary, priced, recommendation) {
    const selected = summary.selectedRow;
    if (!selected?.priced || !priced.length) {
        const best = summary.bestRow;
        return {
            title: best ? `Start with ${best.modelName}` : "Run the calculator to get a verdict",
            subtitle: best
                ? `Lowest estimate at ${formatCost(best.monthlyCost)}/mo across ${priced.length} priced models.`
                : "Every priced model gets ranked by monthly cost for your exact workload.",
            reasons: best ? [
                `${priced.length} priced models ranked on identical token counts`,
                `Priciest option costs ${formatCost(priced[priced.length - 1]?.monthlyCost)} — compare before committing`
            ] : [],
            alreadyCheapest: false,
            cheapestId: best?.modelId || null
        };
    }
    const support = summary.decisionSupport || {};
    const cheapest = priced[0];
    const priciest = priced[priced.length - 1];
    const current = selected.monthlyCost;
    if (support.isAlreadyCheapest || cheapest.modelId === selected.modelId) {
        const runner = priced[1];
        const gap = runner ? runner.monthlyCost - current : null;
        return {
            title: `You're already on the cheapest — ${selected.modelName}`,
            subtitle: `Nothing beats ${formatCost(current)}/mo for this workload.`,
            reasons: [
                `Beats ${priced.length - 1} other priced models head-to-head`,
                runner ? `Next cheapest (${runner.modelName}) is ${formatCost(gap)}/mo more` : "Only one priced model available",
                `Priciest (${priciest.modelName}) is ${(priciest.monthlyCost / Math.max(current, 1e-9)).toFixed(1)}× more — you avoided that`
            ],
            alreadyCheapest: true,
            cheapestId: selected.modelId
        };
    }
    const saving = current - cheapest.monthlyCost;
    const pct = current > 0 ? (saving / current) * 100 : 0;
    const reasons = [
        `${cheapest.modelName} costs ${formatCost(cheapest.monthlyCost)}/mo vs your ${formatCost(current)}/mo`,
        `Same ${formatInt(selected.totalTokens)} tokens/req — the gap is pure price, not workload`
    ];
    if (cheapest.provider !== selected.provider) {
        reasons.push(`Involves switching provider (${selected.provider} → ${cheapest.provider}) — weigh integration cost`);
    } else {
        reasons.push(`Same provider (${cheapest.provider}) — lowest switching friction`);
    }
    const opt = (recommendation?.items || []).find((i) => i.type === "optimization");
    if (opt?.message) reasons.push(opt.message);
    return {
        title: `Switch to ${cheapest.modelName} — save ${formatCost(saving)}/mo (${formatPercent(pct)})`,
        subtitle: `${formatCost(cheapest.monthlyCost)}/mo vs ${formatCost(current)}/mo · ${formatCost(saving * 12)}/yr potential`,
        reasons: reasons.slice(0, 4),
        alreadyCheapest: false,
        cheapestId: cheapest.modelId
    };
}

function whyTag(row, rank, selected) {
    if (rank === 0) return "Lowest cost";
    if (selected?.priced && row.provider === selected.provider && row.modelId !== selected.modelId) {
        return "Same provider, cheaper";
    }
    if (rank === 1) return "Runner-up";
    if (rank === 2) return "2nd runner-up";
    return `Rank #${rank + 1}`;
}

function verdictHtml(verdict, summary, rankById) {
    const pill = verdict.alreadyCheapest
        ? '<span class="verdict-pill ok">✓ Optimal pick</span>'
        : '<span class="verdict-pill save">AI Smart Pick</span>';
    return `
        <section class="ai-verdict reveal" aria-label="AI recommendation">
            <div class="verdict-head">
                <span class="verdict-spark" aria-hidden="true">✦</span>
                <div>
                    <p class="verdict-eyebrow">Smart verdict · explainable, numbers below</p>
                    <h3>${escapeHtml(verdict.title)}</h3>
                    <p class="verdict-sub">${escapeHtml(verdict.subtitle)}</p>
                </div>
                ${pill}
            </div>
            ${verdict.reasons.length ? `<ul class="verdict-reasons">${verdict.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : ""}
            <div class="verdict-actions">
                <a class="btn btn-primary" href="#/calculator">Tune workload <span class="btn-arrow" aria-hidden="true">→</span></a>
                <a class="btn btn-ghost" href="#/report">View report</a>
                ${summary?.selectedRow ? `<span class="verdict-note">Your pick: <strong>${escapeHtml(summary.selectedRow.modelName)}</strong> · Ranked #${escapeHtml(String(rankOf(summary, rankById) ?? "–"))}</span>` : ""}
            </div>
        </section>`;
}

function rankOf(summary, rankById) {
    const id = summary.selectedRow?.modelId;
    return (id && rankById?.get(id)) ?? null;
}

function topPicksHtml(priced, selectedId, selected) {
    const picks = priced.slice(0, 3);
    if (!picks.length) return "";
    return `
        <section class="top-picks" aria-label="Top 3 picks">
            ${picks.map((row, i) => {
                const saving = selected?.priced && row.modelId !== selectedId
                    ? selected.monthlyCost - row.monthlyCost : null;
                return `
                <article class="pick-card${row.modelId === selectedId ? " is-current" : ""}${i === 0 ? " is-best" : ""}">
                    <div class="pick-medal" aria-hidden="true">${MEDALS[i] || `#${i + 1}`}</div>
                    <p class="pick-why">${escapeHtml(whyTag(row, i, selected))}</p>
                    <strong class="pick-name">${escapeHtml(row.modelName)}</strong>
                    <small class="pick-provider">${escapeHtml(row.provider)} · ${escapeHtml(row.family)}</small>
                    <p class="pick-cost">${formatCost(row.monthlyCost)}<small>/mo</small></p>
                    ${saving !== null ? (saving > 0
                        ? `<p class="pick-save positive">−${escapeHtml(formatCost(Math.abs(saving)))} vs current</p>`
                        : saving < 0
                            ? `<p class="pick-save negative">+${escapeHtml(formatCost(Math.abs(saving)))} vs current</p>`
                            : `<p class="pick-save">Your current pick</p>`)
                        : `<p class="pick-save">Rank #${i + 1} cheapest</p>`}
                    ${row.modelId === selectedId ? '<span class="badge current">Current</span>' : ""}
                </article>`;
            }).join("")}
        </section>`;
}

function filterBarHtml(providers, pricedCount, totalCount) {
    return `
        <div class="compare-filters" role="search" aria-label="Filter compared models">
            <label class="filter-field">
                <span>Search</span>
                <input id="cmpSearch" type="search" placeholder="e.g. opus, gemini, grok…" value="${escapeHtml(query)}" autocomplete="off" />
            </label>
            <label class="filter-field">
                <span>Provider</span>
                <select id="cmpProvider">
                    <option value="all"${providerFilter === "all" ? " selected" : ""}>All providers</option>
                    ${providers.map((p) => `<option value="${escapeHtml(p)}"${providerFilter === p ? " selected" : ""}>${escapeHtml(p)}</option>`).join("")}
                </select>
            </label>
            <label class="filter-field">
                <span>Sort</span>
                <select id="cmpSort">
                    <option value="cheap"${sortMode === "cheap" ? " selected" : ""}>Cheapest first</option>
                    <option value="expensive"${sortMode === "expensive" ? " selected" : ""}>Priciest first</option>
                    <option value="name"${sortMode === "name" ? " selected" : ""}>Name A–Z</option>
                </select>
            </label>
            <p class="filter-count" aria-live="polite"><strong>${pricedCount}</strong> of ${totalCount} priced models shown</p>
        </div>`;
}

function rowHtml(row, summary, bestId, selectedId, maxMonthly, index, rank) {
    const monthly = row.priced ? formatCost(row.monthlyCost) : "—";
    const annual = row.priced ? formatCost(row.annualCost) : "—";
    const rel = row.priced && maxMonthly > 0 ? Math.max((row.monthlyCost / maxMonthly) * 100, 2) : 0;
    const savings = (!row.priced || row.modelId === selectedId || !summary.selectedRow?.priced) ? null
        : summary.selectedRow.monthlyCost - row.monthlyCost;
    const pct = savings !== null && summary.selectedRow.monthlyCost > 0
        ? ((savings / summary.selectedRow.monthlyCost) * 100) : null;
    const stagger = index < 3 ? ` reveal reveal-${index}` : "";

    return `
        <div class="compare-item${row.modelId === bestId ? " best" : ""}${row.modelId === selectedId ? " current" : ""}${stagger}">
            <div class="compare-model">
                <span class="rank-num" aria-hidden="true">${rank !== null ? `#${rank}` : "–"}</span>
                <strong>${escapeHtml(row.modelName)}</strong>
                <small>${escapeHtml(row.provider)} · ${escapeHtml(row.family)}</small>
                <small>In ${formatPerMillion(row.inputRatePer1M)} · Out ${formatPerMillion(row.outputRatePer1M)}</small>
                ${row.priced ? "" : `<small class="unavailable-note">${escapeHtml(row.pricingNote)}</small>`}
                ${badges(row, bestId, selectedId)}
            </div>
            <div class="compare-cell"><span>Tokens / req</span><strong>${formatInt(row.totalTokens)}</strong></div>
            <div class="compare-cell"><span>Monthly</span><strong>${monthly}</strong><small>${annual} / year</small>
                ${row.priced ? `<div class="cost-bar" aria-hidden="true"><i style="width:${rel.toFixed(1)}%"></i></div>` : ""}</div>
            <div class="compare-cell"><span>vs. current</span>
                ${savings === null ? "<strong>—</strong>" : `
                <strong class="${savings > 0 ? "positive" : "negative"}">${savings > 0 ? "−" : "+"}${formatCost(Math.abs(savings))}</strong>
                <small>${Math.abs(pct).toFixed(1)}% ${savings > 0 ? "less" : "more"}</small>`}</div>
        </div>`;
}

function applyFilters(priced) {
    const q = query.trim().toLowerCase();
    let rows = priced.filter((r) => {
        if (providerFilter !== "all" && r.provider !== providerFilter) return false;
        if (q && !`${r.modelName} ${r.provider} ${r.family} ${r.modelId}`.toLowerCase().includes(q)) return false;
        return true;
    });
    if (sortMode === "expensive") rows = [...rows].sort((a, b) => b.monthlyCost - a.monthlyCost);
    else if (sortMode === "name") rows = [...rows].sort((a, b) => String(a.modelName).localeCompare(String(b.modelName)));
    return rows;
}

export function render() {
    const { result, comparisonRows, comparisonSummary, recommendation } = getStore();
    const head = `
        <div class="view-head">
            <h2>Smart Compare</h2>
            <p>AI verdict + top picks first, full leaderboard below${result ? ` — based on “${escapeHtml(result.modelName)}” inputs` : ""}.</p>
        </div>`;
    if (!comparisonRows.length) {
        return `${head}
        <section class="card">
            <div class="panel-head">
                <h3>Race the models against your workload</h3>
                <p>Run the calculator once — every priced model gets ranked by monthly cost with savings vs your pick.</p>
            </div>
            <div class="btn-row" style="margin-top:0">
                <a class="btn btn-primary" href="#/calculator">Rank My Workload <span class="btn-arrow" aria-hidden="true">→</span></a>
            </div>
        </section>`;
    }
    const summary = comparisonSummary;
    const selectedId = summary.selectedRow?.modelId;
    const bestId = summary.bestRow?.modelId;
    const priced = comparisonRows.filter((r) => r.priced);
    const unpriced = comparisonRows.filter((r) => !r.priced);
    const maxMonthly = Math.max(...priced.map((r) => r.monthlyCost || 0), 1);
    const providers = [...new Set(priced.map((r) => r.provider))].sort();

    const verdict = buildVerdict(summary, priced, recommendation);
    const filtered = applyFilters(priced);
    const rankById = new Map(priced.map((r, i) => [r.modelId, i + 1]));

    /* First page of the leaderboard, always keeping the selected model
       visible even when it ranks past the page cut. */
    let visible = filtered.filter((r) => expanded || r.modelId === selectedId || filtered.indexOf(r) < INITIAL_ROWS);
    if (expanded) visible = filtered;
    if (!expanded && selectedId && filtered.some((r) => r.modelId === selectedId) && !visible.some((r) => r.modelId === selectedId)) {
        visible = [...visible, filtered.find((r) => r.modelId === selectedId)];
    }

    const hiddenCount = filtered.length - visible.length;
    const noMatch = filtered.length === 0
        ? `<div class="empty-note">No models match “${escapeHtml(query)}”${providerFilter !== "all" ? ` in ${escapeHtml(providerFilter)}` : ""}. <button type="button" class="linklike" id="cmpReset">Clear filters</button></div>`
        : "";
    return `${head}
        ${verdictHtml(verdict, summary, rankById)}
        ${topPicksHtml(priced, selectedId, summary.selectedRow)}
        ${filterBarHtml(providers, filtered.length, priced.length)}
        ${noMatch}
        <div class="board-head" aria-hidden="true"><strong>${filtered.length}</strong> priced models ranked · bars show monthly cost relative to the priciest</div>
        <div class="compare-list">${visible.map((r, i) => rowHtml(r, summary, bestId, selectedId, maxMonthly, i, rankById.get(r.modelId) ?? null)).join("")}</div>
        ${hiddenCount > 0 ? `<div class="btn-row"><button type="button" class="btn btn-ghost" id="expandCompare">Show all ${filtered.length} priced models (${hiddenCount} more)</button></div>`
            : (expanded && filtered.length > INITIAL_ROWS ? `<div class="btn-row"><button type="button" class="btn btn-ghost" id="collapseCompare">Show fewer</button></div>` : "")}
        ${unpriced.length ? `
        <details class="collapse" style="margin-top:1rem">
            <summary>Without verified pricing (${unpriced.length})</summary>
            <div class="collapse-body"><div class="compare-list">${unpriced.map((r) => rowHtml(r, summary, bestId, selectedId, maxMonthly, 9, null)).join("")}</div></div>
        </details>` : ""}`;
}

function rerender(preserveFocusId) {
    const outlet = document.getElementById("view");
    if (!outlet) return;
    let selStart = null;
    const active = preserveFocusId ? document.getElementById(preserveFocusId) : null;
    if (active && "selectionStart" in active) {
        try { selStart = [active.selectionStart, active.selectionEnd]; } catch { selStart = null; }
    }
    outlet.innerHTML = render();
    mount();
    if (preserveFocusId) {
        const el = document.getElementById(preserveFocusId);
        if (el) {
            el.focus({ preventScroll: true });
            if (el && selStart && "setSelectionRange" in el) {
                try { el.setSelectionRange(selStart[0], selStart[1]); } catch { /* noop */ }
            }
        }
    }
}

export function mount() {
    $id("expandCompare")?.addEventListener("click", () => { expanded = true; rerender(); });
    $id("collapseCompare")?.addEventListener("click", () => { expanded = false; rerender(); });
    $id("cmpReset")?.addEventListener("click", () => {
        query = ""; providerFilter = "all"; sortMode = "cheap"; expanded = false; rerender();
    });
    $id("cmpSearch")?.addEventListener("input", (e) => {
        query = e.target.value;
        rerender("cmpSearch");
    });
    $id("cmpProvider")?.addEventListener("change", (e) => {
        providerFilter = e.target.value; expanded = false; rerender();
    });
    $id("cmpSort")?.addEventListener("change", (e) => {
        sortMode = e.target.value; rerender();
    });
}
