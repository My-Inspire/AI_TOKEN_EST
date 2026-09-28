/* =========================================================
   Scenario analysis (authoritative): cost scaling across
   usage levels for the selected model.
   ========================================================= */

import { getModel } from "./modelService.js";
import {
    calculateCostDetailed,
    calculateMonthlyCost,
    calculateAnnualCost
} from "./pricingService.js";
import { calculateInputTokens } from "./tokenService.js";
import { toInt, DEFAULT_OUTPUT_TOKENS, DEFAULT_MONTHLY_REQUESTS } from "../validation/schemas.js";

const SCENARIOS = {
    current: { label: "Current Workload" },
    low: { label: "Low Usage (1K req/mo)", monthlyRequests: 1000 },
    medium: { label: "Medium Usage (10K req/mo)", monthlyRequests: 10000 },
    high: { label: "High Usage (50K req/mo)", monthlyRequests: 50000 },
    veryHigh: { label: "Very High (100K req/mo)", monthlyRequests: 100000 }
};

export function listScenarios() {
    return SCENARIOS;
}

export function analyzeScenarios({
    prompt = "",
    fileText = null,
    fileMeta = null,
    parseMeta = null,
    files = null,
    outputTokens,
    monthlyRequests,
    modelId,
    useCachedInput = false,
    pricingMode = "standard",
    scenarios = ["current", "low", "medium", "high", "veryHigh"],
    fx
}) {
    const model = getModel(modelId);
    if (!model) return [];

    const validOutput = toInt(outputTokens, DEFAULT_OUTPUT_TOKENS);
    /* "current" has no preset volume — it scales with the user's own
       monthlyRequests (falling back to the documented default only when
       the caller supplies nothing usable). */
    const currentRequests = toInt(monthlyRequests, DEFAULT_MONTHLY_REQUESTS);
    const inputEstimation = calculateInputTokens({ prompt, fileText, fileMeta, parseMeta, files, model });
    const inputTokens = inputEstimation.tokens;
    /* Per-request cost is volume-independent — compute once, scale monthly. */
    const detailed = calculateCostDetailed(inputTokens, validOutput, model, useCachedInput, pricingMode, fx);
    const costPerRequest = detailed.ok ? detailed.totalCost : null;

    return scenarios.map((key) => {
        const scenario = SCENARIOS[key];
        if (!scenario) return null;
        const scenarioRequests = scenario.monthlyRequests || currentRequests;
        const monthlyCost = calculateMonthlyCost(costPerRequest, scenarioRequests);
        return {
            key,
            label: scenario.label,
            monthlyRequests: scenarioRequests,
            costPerRequest,
            monthlyCost,
            annualCost: calculateAnnualCost(monthlyCost),
            totalTokens: inputTokens + validOutput,
            inputTokens,
            outputTokens: validOutput
        };
    }).filter(Boolean);
}
