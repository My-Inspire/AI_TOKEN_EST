/* =========================================================
   Help: short expandable answers, no walls of text.
   ========================================================= */

import { getExchangeRate } from "../app/prefs.js";

const topics = () => [
    ["What are tokens?",
        "Models read and write text in chunks called tokens — roughly 4 characters each in English. Both your input and the model's output consume tokens, and both are billed."],
    ["Input vs output tokens",
        "Input tokens cover your prompt plus any uploaded file content. Output tokens are what you ask the model to generate. Output rates are usually higher — output-heavy workloads should be compared on output price, not blended cost."],
    ["Are token counts exact?",
        "No — they are provider-calibrated token estimates, not exact tokenizer outputs. Counting is calibrated per provider (word structure, digits, code punctuation, CJK and emoji handling differ by model family), so expect small differences versus the usage a provider reports on your bill. Costs are estimates built on those estimates."],
    ["How cost is calculated",
        `Cost per request = (input ÷ 1M × input rate) + (output ÷ 1M × output rate), using verified USD-per-1M pricing converted to rupees at ₹${getExchangeRate().toFixed(2)}/USD (adjustable in Settings). Monthly is cost × requests; annual is monthly × 12. Long-context tiers switch automatically past each model's threshold.`],
    ["What do verified and unverified mean?",
        "Verified models carry official published rates. Unverified models still show token counts, but no cost figure is produced — the app never fabricates a $0.00."],
    ["How file extraction works",
        "PDF, DOCX, XLSX, PPTX, text, data and image files are parsed by the backend first, with an in-browser fallback if the server can't read them. Images stay local for OCR; scanned pages and photos go through it, using a tile-based token approximation. If extraction fails, a clearly labelled size-based fallback is used instead."],
    ["Keyboard basics",
        "Tab and Shift+Tab move through controls, Enter or Space activates the upload zone, and every view moves focus to its heading on navigation. Text size, theme and motion controls live in the top bar and Settings."]
];

export function render() {
    const items = topics().map(([title, body]) => `
        <details class="collapse">
            <summary>${title}</summary>
            <div class="collapse-body"><p style="color:var(--muted);font-size:0.82rem">${body}</p></div>
        </details>`).join("");
    return `
        <div class="view-head">
            <h2>Help</h2>
        </div>
        <div class="stack narrow">${items}</div>`;
}

export function mount() { /* static view */ }
