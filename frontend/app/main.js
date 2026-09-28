/* =========================================================
   Bootstrap: preferences → shell → backend init → router.
   Served by the backend (same origin):
   node backend/server.js
   ========================================================= */

import { applyStoredPreferences, refreshRateNote } from "./prefs.js";
import { renderSidebar } from "../components/sidebar.js";
import { renderTopbar, initTopbar } from "../components/topbar.js";
import { initRouter, renderRoute } from "./router.js";
import { initApi } from "../services/api.js";
import { escapeHtml } from "../utils/dom.js";

function initShell() {
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.innerHTML = renderSidebar("dashboard");

    const topbar = document.getElementById("topbar");
    if (topbar) {
        topbar.innerHTML = renderTopbar();
        initTopbar();
    }
}

function showFatal(message, hint) {
    const outlet = document.getElementById("view");
    if (outlet) {
        outlet.innerHTML = `
            <div class="view-head"><h2>Backend unavailable</h2></div>
            <div class="panel">
                <p>${escapeHtml(message)}</p>
                <p style="color:var(--muted);font-size:0.82rem">${escapeHtml(hint)}</p>
                <div class="btn-row">
                    <button type="button" class="btn btn-primary" id="retryBoot">Retry</button>
                </div>
            </div>`;
        document.getElementById("retryBoot")?.addEventListener("click", () => window.location.reload());
    }
}

const START_HINT = "From the project folder, run: node backend/server.js — then open http://127.0.0.1:3000. A plain static file server cannot serve the API.";

async function boot() {
    applyStoredPreferences();
    initShell();
    try {
        await initApi();
    } catch (error) {
        console.error("Backend init failed:", error);
        const status = error?.status;
        if (status === 404) {
            showFatal(
                "This page is served without the API (static file server responds, but has no /api/* routes).",
                START_HINT
            );
        } else {
            showFatal(error?.message || "Could not reach the backend.", START_HINT);
        }
        return;
    }
    refreshRateNote();
    window.addEventListener("currency:changed", () => {
        refreshRateNote();
        renderRoute();
    });
    initRouter();
}

boot();
