/* =========================================================
   Pricing engine (authoritative). Pure calculation, no I/O.
   Amounts are INR: USD catalogue rates convert exactly once
   here via the caller-supplied fx rate. fx is required —
   callers resolve it (request override → ENV → default).
   ========================================================= */

import { validateTokenCount, validatePricingMode } from "../validation/schemas.js";
import { isModelPriced } from "./modelService.js";

function requireFx(fx) {
    if (!Number.isFinite(Number(fx)) || Number(fx) <= 0) {
        throw new Error("pricingService: finite positive fx rate required");
    }
    return Number(fx);
}

/* Short/long context tier from the ACTUAL input size. */
function resolvePricingTier(model, inputTokens) {
    const tiers = model?.pricing?.tiers;
    if (!tiers || !tiers.shortContext) return { tier: "standard", rates: null };
    const threshold = model.pricing.longContextThreshold;
    const hasThreshold = threshold !== null && threshold !== undefined && threshold !== "" &&
        Number.isFinite(Number(threshold));
    if (tiers.longContext && hasThreshold && Number(inputTokens) >= Number(threshold)) {
        return { tier: "longContext", rates: tiers.longContext };
    }
    return { tier: "shortContext", rates: tiers.shortContext };
}

export function getEffectiveRates(model, { inputTokens = 0, useCachedInput = false, pricingMode = "standard", fx } = {}) {
    const rate = requireFx(fx);
    if (!model) return { ok: false, error: "Missing model." };
    if (!isModelPriced(model)) {
        const reason = model.pricingStatus === "unverified"
            ? "Pricing is unverified for this model — cost cannot be reliably calculated."
            : "No verified pricing configured for this model.";
        return { ok: false, error: reason, unverified: model.pricingStatus === "unverified" };
    }
    const modeCheck = validatePricingMode(pricingMode);
    if (!modeCheck.ok) return { ok: false, error: modeCheck.error };
    const mode = modeCheck.value;

    const p = model.pricing;
    const { tier, rates } = resolvePricingTier(model, inputTokens);
    let input = rates?.input ?? p.input ?? null;
    let output = rates?.output ?? p.output ?? null;
    let cachedInput = rates?.cachedInput ?? p.cachedInput ?? null;
    const appliedTier = rates ? tier : "standard";
    let appliedMode = "standard";
    const notes = [];

    if (model.status === "archived") {
        notes.push("Archived model: historical pricing; not recommended for new workloads.");
    }

    if (mode === "batch") {
        const b = p.batch;
        if (b && Number.isFinite(Number(b.input)) && Number.isFinite(Number(b.output))) {
            input = Number(b.input);
            output = Number(b.output);
            appliedMode = "batch";
        } else {
            return { ok: false, error: "Batch pricing is not published for this model." };
        }
    }

    let inputSource = "standard";
    if (appliedMode === "standard" && useCachedInput === true) {
        if (cachedInput !== null && cachedInput !== undefined && Number.isFinite(Number(cachedInput))) {
            input = Number(cachedInput);
            inputSource = "cachedInput";
        } else {
            notes.push("Cached-input pricing requested but not published — standard input rate applied.");
        }
    }

    input = Number(input);
    output = Number(output);
    if (!Number.isFinite(input) || !Number.isFinite(output)) {
        return { ok: false, error: "Resolved pricing tier is incomplete for this model." };
    }
    return { ok: true, input: input * rate, output: output * rate, tier: appliedTier, mode: appliedMode, inputSource, notes };
}

export function calculateCostDetailed(inputTokens, outputTokens, model, useCachedInput = false, pricingMode = "standard", fx) {
    const cached = useCachedInput;
    const mode = pricingMode;
    if (!model) return { ok: false, error: "Missing model: select a model before calculating." };

    const inCheck = validateTokenCount(inputTokens, "Input tokens");
    if (!inCheck.ok) return { ok: false, error: inCheck.error };
    const outCheck = validateTokenCount(outputTokens, "Output tokens");
    if (!outCheck.ok) return { ok: false, error: outCheck.error };

    const rates = getEffectiveRates(model, {
        inputTokens: inCheck.value,
        useCachedInput: cached === true,
        pricingMode: mode || "standard",
        fx
    });
    if (!rates.ok) return { ok: false, error: rates.error, unverified: rates.unverified };

    const inputCost = (inCheck.value / 1_000_000) * rates.input;
    const outputCost = (outCheck.value / 1_000_000) * rates.output;
    if (!Number.isFinite(inputCost) || !Number.isFinite(outputCost)) {
        return { ok: false, error: "Calculation overflowed — check token counts." };
    }
    return {
        ok: true,
        inputCost,
        outputCost,
        totalCost: inputCost + outputCost,
        inputRatePer1M: rates.input,
        outputRatePer1M: rates.output,
        tier: rates.tier,
        mode: rates.mode,
        inputSource: rates.inputSource,
        notes: rates.notes
    };
}

export function calculateCostBreakdown(inputTokens, outputTokens, model, useCachedInput = false, pricingMode = "standard", fx) {
    const detailed = calculateCostDetailed(inputTokens, outputTokens, model, useCachedInput, pricingMode, fx);
    if (!detailed.ok) return null;
    return {
        inputTokens: Number(inputTokens),
        outputTokens: Number(outputTokens),
        inputRatePerToken: detailed.inputRatePer1M / 1_000_000,
        outputRatePerToken: detailed.outputRatePer1M / 1_000_000,
        inputRatePer1M: detailed.inputRatePer1M,
        outputRatePer1M: detailed.outputRatePer1M,
        inputCost: detailed.inputCost,
        outputCost: detailed.outputCost,
        totalCost: detailed.totalCost,
        pricingMode: detailed.mode,
        pricingTier: detailed.tier,
        inputSource: detailed.inputSource,
        notes: detailed.notes,
        /* Engine amounts are always INR (converted once above). */
        currency: "INR"
    };
}

export function calculateMonthlyCost(costPerRequest, monthlyRequests) {
    if (costPerRequest === null || costPerRequest === undefined) return null;
    if (monthlyRequests === null || monthlyRequests === undefined) return null;
    const monthly = costPerRequest * monthlyRequests;
    return Number.isFinite(monthly) ? monthly : null;
}

export function calculateAnnualCost(monthlyCost) {
    if (monthlyCost === null || monthlyCost === undefined) return null;
    const annual = monthlyCost * 12;
    return Number.isFinite(annual) ? annual : null;
}

export function calculateCostPer1KTokens(costPerRequest, totalTokens) {
    if (costPerRequest === null || costPerRequest === undefined || !totalTokens) return null;
    const value = (costPerRequest / totalTokens) * 1000;
    return Number.isFinite(value) ? value : null;
}

export function calculateCostPer1MTokens(costPerRequest, totalTokens) {
    if (costPerRequest === null || costPerRequest === undefined || !totalTokens) return null;
    const value = (costPerRequest / totalTokens) * 1_000_000;
    return Number.isFinite(value) ? value : null;
}
