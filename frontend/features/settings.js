/* =========================================================
   Settings: one compact panel, grouped rows.
   ========================================================= */

import { CALCULATION_DEFAULTS, exchangeRateFallback } from "../data/config.js";
import { $id, readIntInput } from "../utils/dom.js";
import {
    getPreference, setPreference,
    applyTheme, applyFontSize, applyMotion,
    getDefaultOverrides, setDefaultOverrides, getExchangeRate,
    refreshRateNote
} from "../app/prefs.js";
import { showToast } from "../components/toasts.js";

function segRow({ title, text, name, options, current }) {
    return `
        <div class="setting-row">
            <div><strong>${title}</strong><p>${text}</p></div>
            <div class="seg" role="group" aria-label="${title}">
                ${options.map((o) => `<button type="button" data-setting="${name}" data-value="${o.value}" aria-pressed="${current === o.value}">${o.label}</button>`).join("")}
            </div>
        </div>`;
}

export function render() {
    const theme = getPreference("theme", "dark");
    const fontSize = getPreference("fontSize", "medium");
    const motion = getPreference("motion", "auto");
    const overrides = getDefaultOverrides();
    const outDefault = overrides.outputTokens ?? CALCULATION_DEFAULTS.outputTokens;
    const reqDefault = overrides.monthlyRequests ?? CALCULATION_DEFAULTS.monthlyRequests;
    const rateDefault = getExchangeRate(exchangeRateFallback.USD_TO_INR);
    const rateSource = `Reference ${exchangeRateFallback.USD_TO_INR.toFixed(2)} as of ${exchangeRateFallback.asOf}. Applies to every figure.`;

    return `
        <div class="view-head">
            <h2>Settings</h2>
        </div>
        <section class="card narrow" aria-label="Settings">
            <h3 class="setting-group-title">Appearance</h3>
            ${segRow({ title: "Color theme", text: "Applies instantly.", name: "theme",
                options: [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }], current: theme })}
            <h3 class="setting-group-title">Accessibility</h3>
            <div class="setting-row">
                <div><strong>Text size</strong><p>Scales the whole interface.</p></div>
                <div class="seg" role="group" aria-label="Text size">
                    <button type="button" data-font-option="small" aria-pressed="${fontSize === "small"}">A−</button>
                    <button type="button" data-font-option="medium" aria-pressed="${fontSize === "medium"}">A</button>
                    <button type="button" data-font-option="large" aria-pressed="${fontSize === "large"}">A+</button>
                </div>
            </div>
            ${segRow({ title: "Motion", text: "Reduce non-essential animations.", name: "motion",
                options: [{ value: "auto", label: "Full" }, { value: "reduce", label: "Reduced" }], current: motion })}
            <h3 class="setting-group-title">Currency</h3>
            <div class="setting-row">
                <div><strong>USD → INR rate</strong><p>${rateSource}</p></div>
            </div>
            <div class="field" style="margin-bottom:0">
                <label for="setRate">Reference rate (₹ per $1)</label>
                <input id="setRate" type="number" value="${rateDefault}" step="0.01" min="0.01" inputmode="decimal">
            </div>
            <h3 class="setting-group-title">Calculator defaults</h3>
            <div class="form-grid">
                <div class="field">
                    <label for="setOutput">Default output tokens</label>
                    <input id="setOutput" type="number" value="${outDefault}" min="1" inputmode="numeric">
                </div>
                <div class="field">
                    <label for="setRequests">Default monthly requests</label>
                    <input id="setRequests" type="number" value="${reqDefault}" min="1" inputmode="numeric">
                </div>
            </div>
            <div class="btn-row"><button type="button" class="btn btn-primary" id="saveDefaults">Save Defaults</button></div>
        </section>`;
}

export function mount() {
    /* Scope to this view: the topbar carries its own [data-font-option]
       group with a boot-time binding — document-wide queries would stack
       duplicate listeners onto those persistent buttons on repeat visits. */
    const root = document.getElementById("view") || document;
    root.querySelectorAll("[data-setting]").forEach((button) => {
        button.addEventListener("click", () => {
            const name = button.dataset.setting;
            const value = button.dataset.value;
            setPreference(name, value);
            if (name === "theme") applyTheme(value);
            if (name === "motion") applyMotion(value === "reduce" ? "reduce" : "auto");
            root.querySelectorAll(`[data-setting="${name}"]`).forEach((b) => {
                b.setAttribute("aria-pressed", b === button ? "true" : "false");
            });
            showToast("Preference saved.", "success");
        });
    });
    root.querySelectorAll("[data-font-option]").forEach((button) => {
        button.addEventListener("click", () => {
            setPreference("fontSize", button.dataset.fontOption);
            applyFontSize(button.dataset.fontOption);
        });
    });
    document.getElementById("saveDefaults")?.addEventListener("click", () => {
        const outputTokens = readIntInput($id("setOutput"), CALCULATION_DEFAULTS.outputTokens);
        const monthlyRequests = readIntInput($id("setRequests"), CALCULATION_DEFAULTS.monthlyRequests);
        const rawRate = Number($id("setRate")?.value);
        const exchangeRate = Number.isFinite(rawRate) && rawRate > 0
            ? rawRate
            : exchangeRateFallback.USD_TO_INR;
        setDefaultOverrides({ outputTokens, monthlyRequests, exchangeRate });
        refreshRateNote();
        showToast("Defaults and exchange rate saved.", "success");
    });
}
