/* =========================================================
   Cascading model picker: status → provider → model.
   Active reads green, archived reads red. Keyboard operable:
   Enter/Space opens, arrows move, Enter selects, Esc closes.
   Writes the chosen id into #calcModel (hidden input).
   ========================================================= */

import { getCachedModels } from "../services/api.js";
import { escapeHtml } from "../utils/dom.js";
import { PROVIDER_ORDER } from "../data/config.js";

/* Picker data comes from GET /api/models (cached at boot).
   Empty while backend data is unavailable. */
function catalogData() {
    return getCachedModels() || { models: [], providers: [] };
}

function orderedProviders() {
    const providers = catalogData().providers;
    const byId = new Map(providers.map((p) => [p.id, p]));
    return PROVIDER_ORDER.map((id) => byId.get(id)).filter(Boolean)
        .concat(providers.filter((p) => !PROVIDER_ORDER.includes(p.id)));
}

function modelsBy(status, providerId = null) {
    let list = catalogData().models.filter((m) =>
        status === "archived" ? m.status === "archived" : m.status !== "archived");
    if (providerId) list = list.filter((m) => m.provider === providerId);
    return list;
}

function countBy(status, providerId = null) {
    return modelsBy(status, providerId).length;
}

function modelLabel(modelId) {
    if (!modelId) return "Select AI model";
    const found = catalogData().models.find((m) => m.id === modelId);
    if (found) return `${found.name} · ${found.family}`;
    return "Select AI model";
}

function rootView() {
    const active = countBy("active");
    const archived = countBy("archived");
    return `
        <button type="button" class="msel-item msel-status" data-nav="active">
            <span class="msel-status-active">Active Models</span>
            <span class="msel-count">${active}</span>
        </button>
        <button type="button" class="msel-item msel-status" data-nav="archived">
            <span class="msel-status-archived">Archived Models</span>
            <span class="msel-count">${archived}</span>
        </button>`;
}

function providersView(status) {
    const items = orderedProviders()
        .map((p) => ({ provider: p, count: countBy(status, p.id) }))
        .filter((x) => x.count > 0)
        .map(({ provider, count }) => `
            <button type="button" class="msel-item" data-provider="${provider.id}" data-status="${status}">
                <span>${escapeHtml(provider.name)}</span>
                <span class="msel-count">${count}</span>
            </button>`).join("");
    const title = status === "archived" ? "Archived Models" : "Active Models";
    const cls = status === "archived" ? "msel-status-archived" : "msel-status-active";
    return `
        <button type="button" class="msel-back" data-nav="root">‹ All</button>
        <p class="msel-title ${cls}">${title}</p>
        ${items}`;
}

function modelsView(status, providerId) {
    const provider = orderedProviders().find((p) => p.id === providerId);
    const items = modelsBy(status, providerId).map((m) => `
        <button type="button" class="msel-item msel-model" data-model="${m.id}">
            <span><strong>${escapeHtml(m.name)}</strong><small>${escapeHtml(m.family)}${m.hasPricing ? "" : " · pricing unavailable"}</small></span>
        </button>`).join("");
    return `
        <button type="button" class="msel-back" data-nav="providers" data-status="${status}">‹ ${status === "archived" ? "Archived" : "Active"}</button>
        <p class="msel-title">${escapeHtml(provider?.name || "")}</p>
        ${items || `<p class="msel-title">No models found.</p>`}`;
}

export function renderModelSelect(selectedId = "") {
    return `
        <input type="hidden" id="calcModel" value="${escapeHtml(selectedId)}">
        <button type="button" class="msel-btn" id="calcModelBtn" aria-haspopup="true" aria-expanded="false" aria-describedby="calcModelHelp">
            <span class="msel-value" id="calcModelLabel">${escapeHtml(modelLabel(selectedId))}</span>
            <span class="msel-caret" aria-hidden="true">▾</span>
        </button>
        <small class="required-message" id="calcModelHelp">This is mandatory to fill</small>
        <div class="msel-pop" id="calcModelPop" hidden></div>`;
}

let detachOutside = null;

function closePop() {
    const pop = document.getElementById("calcModelPop");
    const btn = document.getElementById("calcModelBtn");
    if (pop) pop.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (detachOutside) {
        document.removeEventListener("pointerdown", detachOutside);
        detachOutside = null;
    }
}

function focusables() {
    const pop = document.getElementById("calcModelPop");
    if (!pop) return [];
    return Array.from(pop.querySelectorAll("button:not([disabled])"));
}

function showView(html) {
    const pop = document.getElementById("calcModelPop");
    if (!pop) return;
    pop.innerHTML = html;
    pop.hidden = false;
    document.getElementById("calcModelBtn")?.setAttribute("aria-expanded", "true");
    wireItems(pop);
    focusables()[0]?.focus();
}

function wireItems(pop) {
    pop.querySelectorAll("[data-nav]").forEach((button) => {
        button.addEventListener("click", () => {
            const nav = button.dataset.nav;
            if (nav === "root") showView(rootView());
            else if (nav === "active" || nav === "archived") showView(providersView(nav));
            else if (nav === "providers") showView(providersView(button.dataset.status));
        });
    });
    pop.querySelectorAll("[data-provider]").forEach((button) => {
        button.addEventListener("click", () => {
            showView(modelsView(button.dataset.status, button.dataset.provider));
        });
    });
    pop.querySelectorAll("[data-model]").forEach((button) => {
        button.addEventListener("click", () => selectModel(button.dataset.model));
    });
    if (!pop.dataset.keysWired) {
        pop.dataset.keysWired = "true";
        pop.addEventListener("keydown", keyHandler);
    }
}

function keyHandler(event) {
    if (event.key === "Escape") {
        event.preventDefault();
        closePop();
        document.getElementById("calcModelBtn")?.focus();
        return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const items = focusables();
    if (!items.length) return;
    const current = items.indexOf(document.activeElement);
    let next = 0;
    if (event.key === "ArrowDown") next = (current + 1) % items.length;
    else if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
    else if (event.key === "End") next = items.length - 1;
    items[next]?.focus();
}

function selectModel(modelId) {
    const hidden = document.getElementById("calcModel");
    const label = document.getElementById("calcModelLabel");
    if (hidden) hidden.value = modelId;
    if (label) label.textContent = modelLabel(modelId);
    closePop();
    document.getElementById("calcModelBtn")?.focus();
    if (typeof selectModel.onSelect === "function") selectModel.onSelect(modelId);
}
selectModel.onSelect = null;

export function mountModelSelect({ selectedId = "", onSelect = null } = {}) {
    closePop();
    selectModel.onSelect = onSelect;
    const hidden = document.getElementById("calcModel");
    const label = document.getElementById("calcModelLabel");
    if (hidden && selectedId) hidden.value = selectedId;
    if (label && selectedId) label.textContent = modelLabel(selectedId);

    document.getElementById("calcModelBtn")?.addEventListener("click", () => {
        const pop = document.getElementById("calcModelPop");
        if (!pop) return;
        if (!pop.hidden) {
            closePop();
            return;
        }
        showView(rootView());
        detachOutside = (event) => {
            const wrap = document.getElementById("modelSelectWrap");
            if (wrap && !wrap.contains(event.target)) closePop();
        };
        document.addEventListener("pointerdown", detachOutside);
    });
}
