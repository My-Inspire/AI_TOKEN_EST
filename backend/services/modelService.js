/* =========================================================
   Model catalogue access. Single home for model lookups so
   pricing/comparison/routes never duplicate them.
   ========================================================= */

import { MODEL_FAMILIES, PROVIDERS } from "../data/catalogue.js";

export function getModel(modelId) {
    if (typeof modelId !== "string" || !modelId) return null;
    return MODEL_FAMILIES[modelId] || null;
}

export function isModelPriced(model) {
    if (!model || !model.pricing) return false;
    if (model.pricingStatus === "unverified") return false;
    const input = model.pricing.input;
    const output = model.pricing.output;
    if (input === null || input === undefined) return false;
    if (output === null || output === undefined) return false;
    const i = Number(input), o = Number(output);
    return Number.isFinite(i) && Number.isFinite(o);
}

/* Lightweight summaries for GET /api/models (picker data + Guide
   pricing reference). Rates stay USD-per-1M as in the catalogue. */
export function listModelSummaries(includeArchived = false) {
    return Object.values(MODEL_FAMILIES)
        .filter((m) => includeArchived || m.status !== "archived")
        .map((m) => ({
            id: m.id,
            name: m.name,
            family: m.family,
            provider: m.provider,
            status: m.status,
            deployment: m.deployment,
            pricingStatus: m.pricingStatus || "unverified",
            hasPricing: isModelPriced(m),
            /* Consumed by the Quick Fixation "Performance Estimate" row. */
            contextWindow: m.contextWindow ?? null,
            /* Consumed by the Guide pricing reference tables. */
            pricing: {
                input: m.pricing?.input ?? null,
                output: m.pricing?.output ?? null,
                cachedInput: m.pricing?.cachedInput ?? null
            },
            pricingSource: m.source?.pricingUrl || null,
            pricingVerifiedAt: m.source?.verifiedAt || null
        }));
}

export function listProviders() {
    return Object.values(PROVIDERS).map((p) => ({ id: p.id, name: p.name, type: p.type, pricingUrl: p.pricingUrl || null }));
}
