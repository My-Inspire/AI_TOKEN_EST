/* =========================================================
   Pricing reference data (backend-owned source of truth):
   display currency, USD→INR reference rate, per-model USD
   rates view, GPU templates, estimation reference tables.
   Catalogue USD values are never rewritten here.
   ========================================================= */

import { MODEL_FAMILIES, PRICING_UNIT, PRICING_CURRENCY } from "./catalogue.js";

/* Currency/unit single-sourced from the catalogue — both names stay
   exported so existing importers keep working. */
export const PRICING_CURRENCY_SOURCE = PRICING_CURRENCY;
export const DISPLAY_CURRENCY = "INR";
export { PRICING_UNIT };

export const EXCHANGE_RATE_DEFAULT = {
    USD_TO_INR: 94.50,
    asOf: "2026-09-04",
    note: "Fixed reference rate for USD catalogue pricing → INR display."
};

/* Effective rate: validated per-request override wins,
   then server ENV override, then the catalogue default. */
export function resolveRate(requestRate, envRate) {
    const custom = Number(requestRate);
    if (requestRate !== undefined && requestRate !== null && requestRate !== "") {
        if (Number.isFinite(custom) && custom > 0) return custom;
        return null; // explicitly invalid → caller rejects with 400
    }
    if (envRate !== undefined && envRate !== null) return envRate;
    return EXCHANGE_RATE_DEFAULT.USD_TO_INR;
}

/* Full USD rates table for GET /api/pricing (source values). */
export function buildRatesTable() {
    const rates = {};
    for (const [id, model] of Object.entries(MODEL_FAMILIES)) {
        const p = model.pricing || {};
        rates[id] = {
            input: p.input ?? null,
            output: p.output ?? null,
            cachedInput: p.cachedInput ?? null,
            cacheWrite: p.cacheWrite ?? null,
            batch: p.batch ? { input: p.batch.input ?? null, output: p.batch.output ?? null } : null,
            tiers: p.tiers || null,
            longContextThreshold: p.longContextThreshold ?? null,
            specialPricing: p.specialPricing || null,
            pricingStatus: model.pricingStatus || "unverified"
        };
    }
    return rates;
}

/* Token-estimation reference tables (tokenService). */
export const ESTIMATION_CONFIG = {
    defaultCharsPerToken: 4,
    byProvider: {
        openai: 4,
        google: 4,
        anthropic: 3.5,
        deepseek: 3.5,
        mistral: 4,
        xai: 4,
        moonshot: 4,
        custom: 4
    },
    byModelType: {
        chat: 4,
        reasoning: 3.5
    }
};

export const FILE_ESTIMATION = {
    bytesPerToken: {
        txt: 4, md: 4, json: 4, xml: 5, csv: 6,
        pdf: 8, docx: 8, xlsx: 10, pptx: 10,
        png: 220, jpg: 220, jpeg: 220, webp: 200,
        default: 6
    },
    maxFileSizeMB: 50
};

export const IMAGE_ESTIMATION = {
    baseTokens: 85,
    perTileTokens: 170,
    tileSize: 512,
    maxLongEdge: 2048,
    note: "Image token estimate uses tile-based approximation. Not an exact model tokenizer count."
};
