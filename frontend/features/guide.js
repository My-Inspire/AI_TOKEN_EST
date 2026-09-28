/* =========================================================
   Guide: user documentation — what the site does, how to use
   it, and what value each section generates. Static view.
   Pricing reference tables render live from the catalogue API,
   so they always match the numbers the app calculates with.
   (Full text also lives in docs/USER_GUIDE.md.)
   ========================================================= */

import { getCachedModels, getCachedGpus } from "../services/api.js";
import { formatInt } from "../utils/format.js";
import { escapeHtml } from "../utils/dom.js";
import { PROVIDER_ORDER, GPU_OEM_ORDER } from "../data/config.js";

const sections = () => [
    ["What this site gives you",
        `<ul>
            <li><strong>Token breakdown</strong> — prompt vs. file tokens, total input, total per request.</li>
            <li><strong>Cost per request, per month, per year</strong> — plus per-1K / per-1M unit rates.</li>
            <li><strong>Model comparison</strong> — your workload ranked across ~50 active models, cheapest alternative highlighted.</li>
            <li><strong>Suggestions</strong> — concrete savings actions with monthly impact.</li>
            <li><strong>Cost Report</strong> — full analysis document with scenarios, exports and print.</li>
            <li><strong>Dashboard</strong> — session KPIs, cost trend, activity log.</li>
        </ul>
        <p>All math runs server-side from verified catalogue pricing (USD rates converted to INR). Nothing is fabricated — empty states stay empty until you calculate.</p>`],
    ["Calculator in 3 steps",
        `<ol>
            <li><strong>Input</strong> — pick a service classification and an AI model (both required). Optionally upload files and/or type a prompt, then set output tokens and monthly requests.</li>
            <li><strong>Token Analysis</strong> — prompt tokens, file tokens (exact sum of every file), total input, plus a per-file breakdown with estimation badges.</li>
            <li><strong>Cost Result</strong> — cost per request, monthly and yearly projections with pricing source. Changed inputs flag results as stale until you re-run.</li>
        </ol>`],
    ["Uploading files",
        `<ul>
            <li>Click the upload zone or drag-and-drop. <strong>Multiple files</strong> can be selected at once, or added in batches — each is parsed independently.</li>
            <li>Supported: PDF, DOCX, TXT, XLSX, CSV, PPTX, images (OCR), JSON, XML, MD. Max 10 files per session.</li>
            <li>The small grey <strong>× on the left of each file removes only that file</strong>; totals update on the next calculation.</li>
            <li><em>Size-based fallback</em> means content wasn't readable — the estimate comes from file size and may differ significantly.</li>
        </ul>`],
    ["Comparison, Suggestions, Dashboard, Cost Report",
        `<ul>
            <li><strong>Comparison</strong> — every active model priced on your workload; archived models listed separately as history, never recommended.</li>
            <li><strong>Suggestions</strong> — savings cards with current → alternative → saved impact, plus unit-economics and workload-shape advice.</li>
            <li><strong>Dashboard</strong> — KPIs, cost/token trend (needs 2+ calculations), usage distribution, activity log.</li>
            <li><strong>Cost Report</strong> — generated document with Current / Low / Medium / High / Very High scenarios, PDF / Print / JSON / CSV exports.</li>
        </ul>`],
    ["Cost Report & exports",
        `<ul>
            <li>On the Cost Result page, <strong>Generate Report</strong> freezes your calculation into a report snapshot (header, executive summary, workload, per-file analysis, model cost, token chart, comparison with your model highlighted red, rankings, savings, scenarios, recommendations, methodology, warnings, pricing).</li>
            <li>The <strong>Report</strong> page offers <strong>Export PDF</strong> (via Print → Save as PDF), <strong>Print</strong>, <strong>JSON</strong> (full snapshot) and <strong>CSV</strong> (workload, files, comparison, scenarios).</li>
            <li>Issued reports never change when you calculate again — generate a new one for fresh numbers.</li>
        </ul>`],
    ["Settings & tips",
        `<ul>
            <li><strong>Settings</strong> — light/dark theme, text size, ₹/$ display currency, default output tokens, monthly requests and USD→INR rate.</li>
            <li>Files are optional: prompt-only, file-only, or combined workloads all work.</li>
            <li>Remove-then-recalculate is the fastest way to see one file's cost impact.</li>
            <li>One failed file never blocks the others; its fallback stays labelled.</li>
            <li>Stale numbers? Restart the backend (<kbd>node backend/server.js</kbd>) and hard-refresh (Ctrl+Shift+R).</li>
        </ul>`]
];

export function render() {
    const items = sections().map(([title, body]) => `
        <details class="collapse">
            <summary>${title}</summary>
            <div class="collapse-body"><div style="color:var(--muted);font-size:0.82rem;line-height:1.65">${body}</div></div>
        </details>`).join("");
    return `
        <div class="view-head">
            <h2>User Guide</h2>
            <p>How to use the site and what value each section generates.</p>
        </div>
        <div class="stack narrow">
            <section class="panel">
                <div class="btn-row" style="margin-top:0">
                    <a class="btn btn-primary" href="#/calculator">Start Calculating <span class="btn-arrow" aria-hidden="true">→</span></a>
                </div>
            </section>
            ${items}
            <details class="collapse">
                <summary>Model pricing reference</summary>
                <div class="collapse-body">${referencesHtml()}</div>
            </details>
            <details class="collapse">
                <summary>GPU pricing reference (IndiaAI)</summary>
                <div class="collapse-body">${gpuReferencesHtml()}</div>
            </details>
        </div>`;
}

export function mount() { /* static view */ }

/* ---------- Live pricing reference: company → family → models ---------- */

/* Known-first/extra-last key ordering shared by both reference tables. */
function orderedKeys(order, map) {
    return order.filter((k) => map.has(k))
        .concat([...map.keys()].filter((k) => !order.includes(k)));
}

function fmtRate(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    return "$" + String(parseFloat(Number(value).toFixed(4)));
}

function statusBadges(model) {
    let html = "";
    if (model.status === "archived") html += ` <span class="badge archived">Archived</span>`;
    else html += ` <span class="badge best">Active</span>`;
    if (model.pricingStatus !== "verified") html += ` <span class="badge unavailable">Unverified pricing</span>`;
    return html;
}

function familyTable(models) {
    const rows = models.map((m) => `
            <tr>
                <td>${escapeHtml(m.name)}${statusBadges(m)}</td>
                <td class="num">${fmtRate(m.pricing?.input)}</td>
                <td class="num">${fmtRate(m.pricing?.output)}</td>
                <td class="num">${m.contextWindow ? formatInt(m.contextWindow) : "—"}</td>
            </tr>`).join("");
    return `
        <div class="ref-table-wrap">
            <table class="ref-table">
                <thead><tr><th scope="col">Model</th><th scope="col">Input $/1M</th><th scope="col">Output $/1M</th><th scope="col">Context</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

function referencesHtml() {
    const data = getCachedModels();
    if (!data?.models?.length) {
        return `<p style="color:var(--muted);font-size:0.82rem">Pricing reference is unavailable — the backend catalogue hasn't loaded. Start the backend and reopen this page.</p>`;
    }
    const byProvider = new Map();
    for (const m of data.models) {
        if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
        byProvider.get(m.provider).push(m);
    }
    const ordered = orderedKeys(PROVIDER_ORDER, byProvider);
    const intro = `<p style="color:var(--muted);font-size:0.78rem;margin-bottom:0.5rem">`
        + `Every model below is grouped <strong>company → family → model</strong>, exactly as the Calculator picker orders them. `
        + `Rates are catalogue USD per 1M tokens — the app converts them to INR at your configured exchange rate. `
        + `Unverified models show token counts but no cost; archived models are history, never recommendations.</p>`;
    return intro + ordered.map((providerId) => {
        const models = byProvider.get(providerId);
        const providerMeta = (data.providers || []).find((p) => p.id === providerId);
        const providerName = providerMeta?.name || providerId;
        const pricingUrl = models.map((m) => m.pricingSource).find(Boolean) || providerMeta?.pricingUrl || null;
        const families = [];
        for (const m of models) {
            if (!families.length || families[families.length - 1][0] !== (m.family || "Other")) {
                families.push([m.family || "Other", []]);
            }
            families[families.length - 1][1].push(m);
        }
        return `
        <details class="collapse" style="margin-top:0.5rem">
            <summary>${escapeHtml(providerName)} — ${models.length} model${models.length === 1 ? "" : "s"}</summary>
            <div class="collapse-body">
                ${pricingUrl ? `<p style="font-size:0.74rem;margin-bottom:0.5rem"><a href="${escapeHtml(pricingUrl)}" target="_blank" rel="noopener">Official ${escapeHtml(providerName)} pricing ↗</a></p>` : ""}
                ${families.map(([family, members]) => `
                    <h4 class="ref-family">${escapeHtml(family)}</h4>
                    ${familyTable(members)}`).join("")}
            </div>
        </details>`;
    }).join("");
}

function fmtInr(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    return "₹" + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function gpuReferencesHtml() {
    const data = getCachedGpus();
    if (!data?.instances?.length) {
        return `<p style="color:var(--muted);font-size:0.82rem">GPU reference is unavailable — the backend GPU catalogue hasn't loaded. Start the backend and reopen this page.</p>`;
    }
    const byOem = new Map();
    for (const g of data.instances) {
        if (!byOem.has(g.oem)) byOem.set(g.oem, []);
        byOem.get(g.oem).push(g);
    }
    const ordered = orderedKeys(GPU_OEM_ORDER, byOem);
    const intro = `<p style="color:var(--muted);font-size:0.78rem;margin-bottom:0.5rem">`
        + `Every GPU below is grouped <strong>OEM → GPU type → instance</strong>, exactly as the Calculator picker orders them. `
        + `Rates are IndiaAI INR per hour per instance (on-demand default; reserved tiers available in the catalogue). `
        + `Source: <a href="https://compute.indiaai.gov.in/pricelist" target="_blank" rel="noopener">compute.indiaai.gov.in/pricelist</a>.</p>`;
    return intro + ordered.map((oemId) => {
        const list = byOem.get(oemId);
        const oemName = (data.oems || []).find((o) => o.id === oemId)?.name || oemId;
        const byType = new Map();
        for (const g of list) {
            if (!byType.has(g.gpuType)) byType.set(g.gpuType, []);
            byType.get(g.gpuType).push(g);
        }
        return `
        <details class="collapse" style="margin-top:0.5rem">
            <summary>${escapeHtml(oemName)} — ${list.length} instance${list.length === 1 ? "" : "s"}</summary>
            <div class="collapse-body">
                ${[...byType.entries()].map(([gpuType, members]) => `
                    <h4 class="ref-family">${escapeHtml(gpuType)}</h4>
                    <div class="ref-table-wrap">
                        <table class="ref-table">
                            <thead><tr><th scope="col">Instance</th><th scope="col">Cards</th><th scope="col">Memory</th><th scope="col">On-demand/hr</th></tr></thead>
                            <tbody>${members.map((m) => `
                                <tr>
                                    <td>${escapeHtml(m.instanceType)}</td>
                                    <td class="num">${m.cards}</td>
                                    <td class="num">${m.memoryGB != null ? `${m.memoryGB}GB` : "—"}</td>
                                    <td class="num">${fmtInr(m.pricing?.onDemand)}</td>
                                </tr>`).join("")}</tbody>
                        </table>
                    </div>`).join("")}
            </div>
        </details>`;
    }).join("");
}
