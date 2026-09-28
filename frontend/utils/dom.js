/* =========================================================
   DOM + input helpers. No feature logic lives here.
   ========================================================= */

export const $id = (id) => document.getElementById(id);

export function toFiniteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

/* Reads integer from numeric input with fallback. */
export function readIntInput(input, fallback) {
    const raw = input?.value;
    if (raw === undefined || raw === null || String(raw).trim() === "") {
        return fallback;
    }
    const value = toFiniteNumber(raw);
    if (value === null || value < 0) return fallback;
    return Math.floor(value);
}

export function escapeHtml(text) {
    return String(text ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function setFieldError(field, hasError) {
    if (!field) return;
    field.classList.toggle("input-error", hasError);
    field.setAttribute("aria-invalid", hasError ? "true" : "false");
}

const BANNER_ID = "formBanner";

export function showFormBanner(message, formId = "calcForm") {
    const form = $id(formId);
    if (!form) return;
    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
        banner = document.createElement("div");
        banner.id = BANNER_ID;
        banner.className = "form-banner";
        banner.setAttribute("role", "alert");
        form.appendChild(banner);
    }
    banner.innerHTML =
        `<strong>Something is missing</strong><span>${escapeHtml(message)}</span>`;
    banner.hidden = false;
}

export function hideFormBanner() {
    const banner = document.getElementById(BANNER_ID);
    if (banner) banner.hidden = true;
}
