/* =========================================================
   Quick Fixation panel: compact live summary shared by the
   Calculator and the Dashboard. Callers pass display-ready
   values ("-" where nothing is calculated yet) — this module
   never computes or fabricates figures.
   ========================================================= */

import { escapeHtml } from "../utils/dom.js";

export function quickFixPanel({
    classification = "-",
    model = "-",
    tokens = "-",
    cost = "-",
    performance = "-",
    insight = "Get insights and optimization suggestions after calculation."
} = {}) {
    return `
        <aside class="panel quick-fix" aria-label="Quick Fixation">
            <div class="panel-head"><h3>Quick Fixation</h3><p>Get the best balance of cost and performance</p></div>
            <div class="qf-rows">
                <div class="qf-row"><span>Service Classification</span><strong>${escapeHtml(classification)}</strong></div>
                <div class="qf-row"><span>AI Model</span><strong>${escapeHtml(model)}</strong></div>
                <div class="qf-row"><span>Estimated Tokens</span><strong>${escapeHtml(tokens)}</strong></div>
                <div class="qf-row"><span>Estimated Cost</span><strong>${escapeHtml(cost)}</strong></div>
                <div class="qf-row"><span>Performance Estimate</span><strong>${escapeHtml(performance)}</strong></div>
            </div>
            <div class="qf-insight">${escapeHtml(insight)}</div>
        </aside>`;
}
