/* POST /api/compare — rows + summary + recommendation.
   Rebuilds the estimate internally so the recommendation
   always matches the compared workload. */

import { validateWorkloadRequest } from "../validation/schemas.js";
import { computeEstimate } from "../services/costService.js";
import { compareAllModels, summarizeComparison } from "../services/comparisonService.js";
import { buildRecommendation } from "../services/recommendationService.js";
import { env } from "../config/environment.js";

export async function handleCompare(body = {}) {
    const checked = validateWorkloadRequest(body, env.RATE_USD_INR);
    if (!checked.ok) return { status: 400, json: { error: checked.error } };

    try {
        const inputs = { ...checked.inputs, fx: checked.rate, currency: "INR" };
        const estimate = await computeEstimate(inputs);
        const fullRows = compareAllModels({ ...inputs, includeArchived: true });
        /* Leaderboard stays active-only (archived is historical, never
           recommended); archived rows ship alongside for group-aware
           consumers such as the dashboard usage distribution. */
        const rows = fullRows.filter((r) => !r.isArchived);
        const archivedRows = fullRows.filter((r) => r.isArchived);
        const summary = summarizeComparison(rows, inputs.modelId);
        const recommendation = buildRecommendation(estimate, rows);
        return { status: 200, json: { estimate, rows, archivedRows, summary, recommendation, rate: checked.rate, currency: "INR" } };
    } catch (error) {
        console.error("POST /api/compare failed:", error);
        return { status: 500, json: { error: "Comparison failed unexpectedly." } };
    }
}
