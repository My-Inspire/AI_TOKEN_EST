/* =========================================================
   IndiaAI GPU picker (V3): OEM → GPU Type → Instance.
   INR-native catalogue from GET /api/gpus (cached at boot).
   Optional — empty means "no GPU infrastructure".
   Mirrors components/model-select.js interaction.
   Writes the chosen id into #calcGpuInstance (hidden input).
   ========================================================= */

import { getCachedGpus } from "../services/api.js";
import { escapeHtml } from "../utils/dom.js";
import { formatCost } from "../utils/format.js";
import { GPU_OEM_ORDER } from "../data/config.js";

function catalogData() {
    return getCachedGpus() || { instances: [], oems: [] };
}

function orderedOems() {
    const oems = catalogData().oems || [];
    const byId = new Map(oems.map((o) => [o.id, o]));
    return GPU_OEM_ORDER.map((id) => byId.get(id)).filter(Boolean)
        .concat(oems.filter((o) => !GPU_OEM_ORDER.includes(o.id)));
}

function instancesBy(oemId = null, gpuType = null) {
    let list = catalogData().instances || [];
    if (oemId) list = list.filter((g) => g.oem === oemId);
    if (gpuType) list = list.filter((g) => g.gpuType === gpuType);
    return list;
}

function gpuLabel(instanceId) {
    if (!instanceId) return "Select IndiaAI GPU";
    const found = (catalogData().instances || []).find((g) => g.id === instanceId);
    if (!found) return "Select IndiaAI GPU";
    return `${found.gpuType} ${found.instanceType} · ${formatCost(found.pricing?.onDemand)}/hr`;
}

function rootView() {
    const oems = orderedOems();
    if (!oems.length) return `<p class="msel-title">GPU catalogue unavailable.</p>`;
    return `
        <button type="button" class="msel-item" data-gpu-instance="">
            <span>No GPU — API cost only</span>
        </button>` + oems.map((o) => {
        const count = instancesBy(o.id).length;
        return `
            <button type="button" class="msel-item" data-gpu-oem="${escapeHtml(o.id)}">
                <span>${escapeHtml(o.name)}</span>
                <span class="msel-count">${count}</span>
            </button>`;
    }).join("");
}

function typesView(oemId) {
    const oem = orderedOems().find((o) => o.id === oemId);
    const seen = new Map();
    for (const g of instancesBy(oemId)) {
        if (!seen.has(g.gpuType)) seen.set(g.gpuType, 0);
        seen.set(g.gpuType, seen.get(g.gpuType) + 1);
    }
    const items = [...seen.entries()].map(([gpuType, count]) => `
        <button type="button" class="msel-item" data-gpu-type="${escapeHtml(gpuType)}" data-gpu-oem="${escapeHtml(oemId)}">
            <span>${escapeHtml(gpuType)}</span>
            <span class="msel-count">${count}</span>
        </button>`).join("");
    return `
        <button type="button" class="msel-back" data-gpu-nav="root">‹ All GPUs</button>
        <p class="msel-title">${escapeHtml(oem?.name || oemId)}</p>
        ${items || `<p class="msel-title">No GPU types found.</p>`}`;
}

function instancesView(oemId, gpuType) {
    const oem = orderedOems().find((o) => o.id === oemId);
    const items = instancesBy(oemId, gpuType).map((g) => `
        <button type="button" class="msel-item msel-model" data-gpu-instance="${escapeHtml(g.id)}">
            <span><strong>${escapeHtml(g.gpuType)} ${escapeHtml(g.instanceType)}</strong><small>${g.cards}x · ${g.memoryGB != null ? `${g.memoryGB}GB · ` : ""}${formatCost(g.pricing?.onDemand)}/hr on-demand</small></span>
        </button>`).join("");
    return `
        <button type="button" class="msel-back" data-gpu-nav="types" data-gpu-oem="${escapeHtml(oemId)}">‹ ${escapeHtml(oem?.name || oemId)}</button>
        <p class="msel-title">${escapeHtml(gpuType)}</p>
        ${items || `<p class="msel-title">No instances found.</p>`}`;
}

export function renderGpuSelect(selectedId = "") {
    return `
        <input type="hidden" id="calcGpuInstance" value="${escapeHtml(selectedId)}">
        <button type="button" class="msel-btn" id="calcGpuBtn" aria-haspopup="true" aria-expanded="false">
            <span class="msel-value" id="calcGpuLabel">${escapeHtml(gpuLabel(selectedId))}</span>
            <span class="msel-caret" aria-hidden="true">▾</span>
        </button>
        <div class="msel-pop" id="calcGpuPop" hidden></div>`;
}

let detachOutside = null;

function closePop() {
    const pop = document.getElementById("calcGpuPop");
    const btn = document.getElementById("calcGpuBtn");
    if (pop) pop.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (detachOutside) {
        document.removeEventListener("pointerdown", detachOutside);
        detachOutside = null;
    }
}

function focusables() {
    const pop = document.getElementById("calcGpuPop");
    if (!pop) return [];
    return Array.from(pop.querySelectorAll("button:not([disabled])"));
}

function showView(html) {
    const pop = document.getElementById("calcGpuPop");
    if (!pop) return;
    pop.innerHTML = html;
    pop.hidden = false;
    document.getElementById("calcGpuBtn")?.setAttribute("aria-expanded", "true");
    wireItems(pop);
    focusables()[0]?.focus();
}

function wireItems(pop) {
    pop.querySelectorAll("[data-gpu-nav]").forEach((button) => {
        button.addEventListener("click", () => {
            const nav = button.dataset.gpuNav;
            if (nav === "root") showView(rootView());
            else if (nav === "types") showView(typesView(button.dataset.gpuOem));
        });
    });
    /* OEM level buttons only — back-navigation buttons also carry
       data-gpu-oem but are already wired above. */
    pop.querySelectorAll("[data-gpu-oem]:not([data-gpu-type]):not([data-gpu-nav])").forEach((button) => {
        button.addEventListener("click", () => showView(typesView(button.dataset.gpuOem)));
    });
    pop.querySelectorAll("[data-gpu-type]").forEach((button) => {
        button.addEventListener("click", () => showView(instancesView(button.dataset.gpuOem, button.dataset.gpuType)));
    });
    pop.querySelectorAll("[data-gpu-instance]").forEach((button) => {
        button.addEventListener("click", () => selectGpu(button.dataset.gpuInstance));
    });
    if (!pop.dataset.keysWired) {
        pop.dataset.keysWired = "true";
        pop.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closePop();
                document.getElementById("calcGpuBtn")?.focus();
                return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const items = focusables();
            if (!items.length) return;
            const current = items.indexOf(document.activeElement);
            let next = 0;
            if (event.key === "ArrowDown") next = (current + 1) % items.length;
            else if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
            else if (event.key === "End") next = items.length - 1;
            items[next]?.focus();
        });
    }
}

function selectGpu(instanceId) {
    const hidden = document.getElementById("calcGpuInstance");
    const label = document.getElementById("calcGpuLabel");
    if (hidden) hidden.value = instanceId;
    if (label) label.textContent = gpuLabel(instanceId);
    closePop();
    document.getElementById("calcGpuBtn")?.focus();
    if (typeof selectGpu.onSelect === "function") selectGpu.onSelect(instanceId);
}
selectGpu.onSelect = null;

export function mountGpuSelect({ selectedId = "", onSelect = null } = {}) {
    closePop();
    selectGpu.onSelect = onSelect;
    const hidden = document.getElementById("calcGpuInstance");
    const label = document.getElementById("calcGpuLabel");
    if (hidden && selectedId) hidden.value = selectedId;
    if (label && selectedId) label.textContent = gpuLabel(selectedId);

    document.getElementById("calcGpuBtn")?.addEventListener("click", () => {
        const pop = document.getElementById("calcGpuPop");
        if (!pop) return;
        if (!pop.hidden) {
            closePop();
            return;
        }
        showView(rootView());
        detachOutside = (event) => {
            const wrap = document.getElementById("gpuSelectWrap");
            if (wrap && !wrap.contains(event.target)) closePop();
        };
        document.addEventListener("pointerdown", detachOutside);
    });
}
