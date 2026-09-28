/* =========================================================
   Full-estimate orchestration (authoritative): tokens →
   costs → projections (+ optional GPU). fx rate is an
   explicit argument (resolved by routes, never global).
   ========================================================= */

import { getModel, isModelPriced } from "./modelService.js";
import {
    calculateCostDetailed,
    calculateCostBreakdown,
    calculateMonthlyCost,
    calculateAnnualCost,
    calculateCostPer1KTokens,
    calculateCostPer1MTokens
} from "./pricingService.js";
import { calculateInputTokens } from "./tokenService.js";
import { calculateGPUCost } from "./gpuService.js";
import { toInt, DEFAULT_OUTPUT_TOKENS, DEFAULT_MONTHLY_REQUESTS } from "../validation/schemas.js";

export async function computeEstimate({
    serviceCategory = "",
    modelId = "",
    prompt = "",
    fileText = null,
    fileMeta = null,
    parseMeta = null,
    files = null,
    outputTokens,
    monthlyRequests,
    useCachedInput = false,
    pricingMode = "standard",
    gpuConfig = null,
    fx,
    currency = "INR"
}) {
    const model = getModel(modelId);
    if (!model) {
        return {
            serviceCategory, modelId: modelId || null,
            modelName: "-", modelFamily: "-", provider: "-",
            deployment: "-", status: "unknown",
            priced: false,
            error: `Unknown model "${modelId}". Select a model from the catalogue.`,
            pricingNote: `Unknown model "${modelId}". Select a model from the catalogue.`,
            pricingSource: null, pricingLastUpdated: null, pricing: null,
            inputTokens: 0, outputTokens: 0, totalTokens: 0,
            inputEstimation: null, costBreakdown: null,
            costPerRequest: null, monthlyCost: null, annualCost: null,
            costPer1KTokens: null, costPer1MTokens: null,
            monthlyRequests: monthlyRequests || 0,
            infrastructureCost: null, hasInfrastructure: false,
            totalMonthlyCost: null, totalAnnualCost: null,
            currency
        };
    }

    const priced = isModelPriced(model);
    const validOutput = toInt(outputTokens, DEFAULT_OUTPUT_TOKENS);
    const validRequests = toInt(monthlyRequests, DEFAULT_MONTHLY_REQUESTS);

    const inputEstimation = calculateInputTokens({ prompt, fileText, fileMeta, parseMeta, files, model });
    const inputTokens = inputEstimation.tokens;
    const totalTokens = inputTokens + validOutput;

    const detailed = calculateCostDetailed(inputTokens, validOutput, model, useCachedInput, pricingMode, fx);
    const costPerRequest = detailed.ok ? detailed.totalCost : null;
    const costBreakdown = calculateCostBreakdown(inputTokens, validOutput, model, useCachedInput, pricingMode, fx);
    const monthlyCost = calculateMonthlyCost(costPerRequest, validRequests);
    const annualCost = calculateAnnualCost(monthlyCost);

    const unavailableReason = detailed.ok ? null : detailed.error;
    const pricingNote = priced
        ? (model.status === "archived"
            ? "Archived model — historical pricing shown; not recommended for new workloads."
            : null)
        : (model.pricingStatus === "unverified"
            ? "Pricing is unverified for this model — cost cannot be reliably calculated."
            : (unavailableReason || "Pricing unavailable."));

    let infrastructureCost = null;
    /* V3: GPU picker lives alongside the AI model (optional, any
       deployment). Whenever a GPU selection is present, model its
       infrastructure cost — legacy gate on self-hosted/private
       removed because catalogue AI models are cloud-hosted. */
    if (gpuConfig) {
        infrastructureCost = calculateGPUCost({
            ...gpuConfig,
            estimatedRequests: validRequests,
            fx
        });
    }

    const infraMonthly = infrastructureCost?.monthlyInfrastructureCost ?? null;
    const infraAnnual = infrastructureCost?.annualInfrastructureCost ?? null;
    const hasInfrastructure = Boolean(infrastructureCost?.hasRealPricing) && infraMonthly !== null;

    return {
        serviceCategory,
        modelId,
        modelName: model?.name || "-",
        modelFamily: model?.family || "-",
        provider: model?.provider || "-",
        deployment: model?.deployment || "-",
        status: model?.status || "active",
        isArchived: model?.status === "archived",
        priced,
        pricingStatus: model?.pricingStatus || "unverified",
        error: unavailableReason,
        pricingNote,
        pricingSource: model?.source?.pricingUrl || null,
        pricingLastUpdated: model?.source?.verifiedAt || null,
        pricingTier: costBreakdown?.pricingTier || null,
        pricingMode: costBreakdown?.pricingMode || pricingMode || "standard",
        pricing: model?.pricing || null,
        inputTokens,
        outputTokens: validOutput,
        totalTokens,
        inputEstimation,
        costBreakdown,
        costPerRequest,
        monthlyCost,
        annualCost,
        costPer1KTokens: calculateCostPer1KTokens(costPerRequest, totalTokens),
        costPer1MTokens: calculateCostPer1MTokens(costPerRequest, totalTokens),
        monthlyRequests: validRequests,
        infrastructureCost,
        hasInfrastructure,
        totalMonthlyCost: monthlyCost !== null && hasInfrastructure ? monthlyCost + infraMonthly : monthlyCost,
        totalAnnualCost: annualCost !== null && hasInfrastructure ? annualCost + infraAnnual : annualCost,
        currency
    };
}
