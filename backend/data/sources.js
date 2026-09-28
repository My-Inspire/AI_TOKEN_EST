/* =========================================================
   Pricing-source tracking. Index is derived from catalogue
   source{} blocks — no URLs or dates are redeclared here.
   ========================================================= */

import { MODEL_FAMILIES, DATA_VERIFIED_AT, PRICING_CURRENCY, PRICING_UNIT } from "./catalogue.js";

export function buildSourceIndex() {
    return Object.values(MODEL_FAMILIES).map((m) => ({
        modelId: m.id,
        provider: m.provider,
        status: m.status,
        pricingStatus: m.pricingStatus || "unverified",
        inputPrice: m.pricing?.input ?? null,
        outputPrice: m.pricing?.output ?? null,
        pricingUrl: m.source?.pricingUrl || null,
        modelUrl: m.source?.modelUrl || null,
        verifiedAt: m.source?.verifiedAt || null,
        verificationMethod: m.source?.verificationMethod || null
    }));
}

export function buildVerificationSummary() {
    const rows = buildSourceIndex();
    const verified = rows.filter((r) => r.pricingStatus === "verified");
    const unverified = rows.filter((r) => r.pricingStatus !== "verified");
    return {
        generatedAt: new Date().toISOString().slice(0, 10),
        dataVerifiedAt: DATA_VERIFIED_AT,
        currency: PRICING_CURRENCY,
        unit: PRICING_UNIT,
        verifiedPricing: verified.length,
        unverifiedPricing: unverified.length,
        requiresManualReview: unverified.map((r) => `${r.provider} / ${r.modelId}`)
    };
}
