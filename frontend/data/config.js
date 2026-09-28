/* =========================================================
   Frontend config: presentation seeds only. Business data
   (models, pricing, templates, scenarios, rate authority)
   lives server-side — see GET /api/config and /api/pricing.
   - SERVICE_CATEGORIES: classification dropdown options.
   - CALCULATION_DEFAULTS: form seed values. Mirror of
     DEFAULT_OUTPUT_TOKENS / DEFAULT_MONTHLY_REQUESTS in
     backend/validation/schemas.js — change both together.
   - exchangeRateFallback: boot fallback until the backend rate
     is cached (prefs backend-rate chain). Mirror of
     EXCHANGE_RATE_DEFAULT in backend/data/pricing.js.
     Never authoritative.
   ========================================================= */

export const SERVICE_CATEGORIES = [
    { id: "official", name: "Official" },
    { id: "public", name: "Public" },
    { id: "confidential", name: "Confidential" }
];

export const CALCULATION_DEFAULTS = {
    outputTokens: 500,
    monthlyRequests: 1000
};

/* Display orders shared by the pickers and the Guide reference
   tables: company → family → model, OEM → GPU type → instance. */
export const PROVIDER_ORDER = ["openai", "google", "anthropic", "deepseek", "mistral", "xai", "moonshot"];
export const GPU_OEM_ORDER = ["nvidia", "amd", "intel", "aws", "gcp"];

export const exchangeRateFallback = {
    USD_TO_INR: 94.50,
    asOf: "2026-09-04"
};
