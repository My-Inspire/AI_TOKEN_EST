/* =========================================================
   Topbar: sidebar toggle, view title, text-size control,
   theme toggle. The toggle collapses the persistent sidebar
   on desktop and opens the drawer on mobile.
   ========================================================= */

import { icon } from "./icons.js";
import { formatDateTime } from "../utils/datetime.js";
import { getPreference, setPreference, applyTheme, applyFontSize, getDisplayCurrency, setDisplayCurrency } from "../app/prefs.js";

const FONT_OPTIONS = [
    { value: "small", label: "A−", tip: "Small text size" },
    { value: "medium", label: "A", tip: "Medium text size" },
    { value: "large", label: "A+", tip: "Large text size" }
];

const CURRENCY_OPTIONS = [
    { value: "INR", label: "₹", tip: "Show costs in Indian rupees" },
    { value: "USD", label: "$", tip: "Show costs in US dollars" }
];

const drawerMedia = () => window.matchMedia("(max-width: 1080px)").matches;

export function renderTopbar() {
    const fontCurrent = getPreference("fontSize", "medium");
    const fontSeg = FONT_OPTIONS.map((o) => `
        <button type="button" data-font-option="${o.value}"
            aria-pressed="${fontCurrent === o.value}" title="${o.tip}" aria-label="${o.tip}">${o.label}</button>`).join("");
    const curCurrent = getDisplayCurrency();
    const curSeg = CURRENCY_OPTIONS.map((o) => `
        <button type="button" data-cur="${o.value}"
            aria-pressed="${curCurrent === o.value}" title="${o.tip}" aria-label="${o.tip}">${o.label}</button>`).join("");
    return `
        <button type="button" class="icon-btn nav-toggle" id="navToggle" aria-label="Toggle sidebar" aria-expanded="true" title="Toggle sidebar">
            ${icon("panel")}
        </button>
        <span class="topbar-title" id="viewTitle">Dashboard</span>
        <div class="topbar-actions">
            <div class="seg seg-compact" role="group" aria-label="Display currency">
                ${curSeg}
            </div>
            <div class="seg seg-compact" role="group" aria-label="Text size">
                ${fontSeg}
            </div>
            <button type="button" class="icon-btn" id="themeToggle" aria-label="Switch to dark theme" title="Toggle dark mode">
                ${icon("moon")}
            </button>
            <span class="period-badge" role="timer" aria-label="Current date and time">${icon("clock")}<span id="topClockTime">${formatDateTime()}</span></span>
        </div>`;
}

function refreshThemeToggle() {
    const toggle = document.getElementById("themeToggle");
    if (!toggle) return;
    const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    toggle.innerHTML = icon(theme === "dark" ? "sun" : "moon");
    toggle.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
}

function syncNavToggle() {
    const button = document.getElementById("navToggle");
    const shell = document.querySelector(".shell");
    if (!button || !shell) return;
    const open = drawerMedia() ? shell.classList.contains("nav-open") : !shell.classList.contains("side-collapsed");
    button.setAttribute("aria-expanded", open ? "true" : "false");
}

function wireFontOptions(root = document) {
    root.querySelectorAll("[data-font-option]").forEach((button) => {
        button.addEventListener("click", () => {
            setPreference("fontSize", button.dataset.fontOption);
            applyFontSize(button.dataset.fontOption);
        });
    });
}

export function setViewTitle(title) {
    const el = document.getElementById("viewTitle");
    if (el) el.textContent = title;
    document.title = `${title} — AI Cost Monitor`;
}

export function initTopbar() {
    document.getElementById("navToggle")?.addEventListener("click", () => {
        const shell = document.querySelector(".shell");
        if (!shell) return;
        if (drawerMedia()) shell.classList.toggle("nav-open");
        else shell.classList.toggle("side-collapsed");
        syncNavToggle();
    });
    document.querySelector(".scrim")?.addEventListener("click", () => {
        document.querySelector(".shell")?.classList.remove("nav-open");
        syncNavToggle();
    });
    document.getElementById("themeToggle")?.addEventListener("click", () => {
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        applyTheme(next);
        setPreference("theme", next);
        refreshThemeToggle();
    });
    wireFontOptions();
    document.querySelectorAll("[data-cur]").forEach((button) => {
        button.addEventListener("click", () => {
            if (getDisplayCurrency() === button.dataset.cur) return;
            setDisplayCurrency(button.dataset.cur);
            document.querySelectorAll("[data-cur]").forEach((other) => {
                other.setAttribute("aria-pressed", other === button ? "true" : "false");
            });
            window.dispatchEvent(new CustomEvent("currency:changed"));
        });
    });
    refreshThemeToggle();
    syncNavToggle();
    const clockTick = () => {
        const el = document.getElementById("topClockTime");
        if (el) el.textContent = formatDateTime();
    };
    clockTick();
    setInterval(clockTick, 15000);
}
