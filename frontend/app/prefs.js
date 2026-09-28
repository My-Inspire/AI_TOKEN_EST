/* =========================================================
   Preferences: display currency, theme, font size, motion,
   backend rate cache + calculator defaults.
   Session-scoped (behavior preserved).
   ========================================================= */

import { exchangeRateFallback } from "../data/config.js";

const THEME_KEY = "aicost.theme";
const FONT_KEY = "aicost.fontSize";
const MOTION_KEY = "aicost.motion";
const DEFAULTS_KEY = "aicost.defaults";
const CURRENCY_KEY = "aicost.currency";

/* Display currency for all cost figures. Engine always computes
   INR; USD display converts back at the effective rate. */
export function getDisplayCurrency() {
    try {
        return sessionStorage.getItem(CURRENCY_KEY) === "USD" ? "USD" : "INR";
    } catch {
        return "INR";
    }
}

export function setDisplayCurrency(value) {
    try {
        sessionStorage.setItem(CURRENCY_KEY, value === "USD" ? "USD" : "INR");
    } catch {
        /* ignore */
    }
}

export function getPreference(key, fallback) {
    const map = { theme: THEME_KEY, fontSize: FONT_KEY, motion: MOTION_KEY };
    try {
        return sessionStorage.getItem(map[key]) || fallback;
    } catch {
        return fallback;
    }
}

export function setPreference(key, value) {
    const map = { theme: THEME_KEY, fontSize: FONT_KEY, motion: MOTION_KEY };
    try {
        sessionStorage.setItem(map[key], value);
    } catch {
        /* private mode — preferences simply won't persist */
    }
}

export function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
}

export function applyFontSize(size) {
    const valid = ["small", "medium", "large"].includes(size) ? size : "medium";
    document.documentElement.dataset.fontSize = valid;
    document.querySelectorAll("[data-font-option]").forEach((button) => {
        const active = button.dataset.fontOption === valid;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
    });
}

export function applyMotion(motion) {
    if (motion === "reduce") document.documentElement.dataset.motion = "reduce";
    else document.documentElement.removeAttribute("data-motion");
}

export function applyStoredPreferences() {
    applyTheme(getPreference("theme", "dark"));
    applyFontSize(getPreference("fontSize", "medium"));
    const motion = getPreference("motion", "auto");
    applyMotion(motion === "reduce" ? "reduce" : "auto");
}

/* Effective USD→INR rate: Settings override wins, else config default. */
export function getReferenceRate() {
    return exchangeRateFallback.USD_TO_INR;
}

let backendRate = null;

/* Cached by api.js from GET /api/config at boot. */
export function setBackendRate(rate) {
    backendRate = Number.isFinite(Number(rate)) && Number(rate) > 0 ? Number(rate) : null;
}

export function getExchangeRate(fallback = getReferenceRate()) {
    const custom = Number(getDefaultOverrides().exchangeRate);
    if (Number.isFinite(custom) && custom > 0) return custom;
    if (backendRate !== null) return backendRate;
    return fallback;
}

/* Footer note follows the effective rate and display currency. */
export function refreshRateNote() {
    const el = document.getElementById("rateNote");
    if (!el) return;
    el.textContent = getDisplayCurrency() === "USD"
        ? "Local calculations · Verified official pricing (USD/1M) · showing USD"
        : `Local calculations · Verified official pricing (USD/1M) · billed in ₹ @ ${getExchangeRate(getReferenceRate()).toFixed(2)}/USD`;
}

/* Calculator default overrides (Settings). */
export function getDefaultOverrides() {
    try {
        const raw = sessionStorage.getItem(DEFAULTS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

export function setDefaultOverrides(values) {
    try {
        sessionStorage.setItem(DEFAULTS_KEY, JSON.stringify(values));
    } catch {
        /* ignore */
    }
}
