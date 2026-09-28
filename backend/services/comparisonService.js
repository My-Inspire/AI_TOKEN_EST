/* =========================================================
   Model comparison (authoritative): same workload priced
   across the catalogue. Rows carry only view-consumed fields
   plus per-1M rates for the leaderboard price columns.
   ========================================================= */

import { MODEL_FAMILIES } from "../data/catalogue.js";
import {
    calculateCostDetailed,
    calculateMonthlyCost,
    calculateAnnualCost,
    calculateCostPer1KTokens,
    calculateCostPer1MTokens
} from "./pricingService.js";
import { calculateInputTokens } from "./tokenService.js";
import { toInt, DEFAULT_OUTPUT_TOKENS, DEFAULT_MONTHLY_REQUESTS } from "../validation/schemas.js";

export function compareAllModels({
    prompt = "",
    fileText = null,
    fileMeta = null,
    parseMeta = null,
    files = null,
    outputTokens,
    monthlyRequests,
    useCachedInput = false,
    pricingMode = "standard",
    includeArchived = false,
    modelId = null,
    fx
}) {
    const validOutput = toInt(outputTokens, DEFAULT_OUTPUT_TOKENS);
    const validRequests = toInt(monthlyRequests, DEFAULT_MONTHLY_REQUESTS);

    const allModels = Object.values(MODEL_FAMILIES);
    /* Token counts depend on the tokenizer (pretoken + per-provider
       calibration), so estimate with the selected model's reference — the
       selected row then matches the /calculate estimate exactly, and all
       rows share one consistent workload size. */
    const referenceModel = (modelId && MODEL_FAMILIES[modelId]) || allModels[0];
    const inputEstimation = calculateInputTokens({ prompt, fileText, fileMeta, parseMeta, files, model: referenceModel });
    const inputTokens = inputEstimation.tokens;
    const totalTokens = inputTokens + validOutput;

    const universe = includeArchived ? allModels : allModels.filter((m) => m.status !== "archived");

    const rows = universe.map((model) => {
        const detailed = calculateCostDetailed(inputTokens, validOutput, model, useCachedInput, pricingMode, fx);
        const costPerRequest = detailed.ok ? detailed.totalCost : null;
        const monthlyCost = calculateMonthlyCost(costPerRequest, validRequests);
        const annualCost = calculateAnnualCost(monthlyCost);
        const priced = costPerRequest !== null;
        return {
            modelId: model.id,
            modelName: model.name,
            family: model.family,
            provider: model.provider,
            deployment: model.deployment,
            isArchived: model.status === "archived",
            priced,
            pricingNote: priced ? null : (detailed.error || "Pricing unavailable"),
            totalTokens,
            costPerRequest,
            monthlyCost,
            annualCost,
            costPer1KTokens: calculateCostPer1KTokens(costPerRequest, totalTokens),
            costPer1MTokens: calculateCostPer1MTokens(costPerRequest, totalTokens),
            inputRatePer1M: detailed.ok ? detailed.inputRatePer1M : null,
            outputRatePer1M: detailed.ok ? detailed.outputRatePer1M : null
        };
    });

    return rows.sort((a, b) => {
        if (a.priced !== b.priced) return a.priced ? -1 : 1;
        if (a.priced && b.priced) return a.costPerRequest - b.costPerRequest;
        return 0;
    });
}

export function summarizeComparison(rows, selectedModelId) {
    /* Precondition: rows arrive cheapest-first (see the sort in
       compareAllModels) — cheapest/mostExpensive rely on that order. */
    const pricedRows = rows.filter((row) => row.priced);
    const selectedRow = rows.find((r) => r.modelId === selectedModelId);

    if (pricedRows.length === 0) {
        return {
            bestRow: null, selectedRow: selectedRow || null,
            saving: null, savingPercent: null,
            cheapestModel: null, mostExpensiveModel: null
        };
    }

    const cheapest = pricedRows[0];
    const mostExpensive = pricedRows[pricedRows.length - 1];
    let saving = null;
    let savingPercent = null;

    if (selectedRow && selectedRow.priced && cheapest.modelId !== selectedModelId) {
        saving = selectedRow.monthlyCost - cheapest.monthlyCost;
        const rawPercent = selectedRow.monthlyCost > 0 ? (saving / selectedRow.monthlyCost) * 100 : null;
        savingPercent = Number.isFinite(rawPercent) ? rawPercent : null;
    }

    return {
        bestRow: cheapest,
        selectedRow,
        saving,
        savingPercent,
        cheapestModel: cheapest,
        mostExpensiveModel: mostExpensive,
        pricedCount: pricedRows.length,
        totalCount: rows.length,
        decisionSupport: selectedRow && selectedRow.priced ? {
            currentMonthlyCost: selectedRow.monthlyCost,
            alternativeMonthlyCost: cheapest.modelId !== selectedModelId ? cheapest.monthlyCost : null,
            alternativeModelName: cheapest.modelId !== selectedModelId ? cheapest.modelName : null,
            potentialMonthlySaving: saving,
            potentialAnnualSaving: saving !== null ? saving * 12 : null,
            isAlreadyCheapest: cheapest.modelId === selectedModelId
        } : null
    };
}
