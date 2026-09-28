/* POST /api/reports — scenario scaling + summary header. */

import { validateWorkloadRequest } from "../validation/schemas.js";
import { getModel } from "../services/modelService.js";
import { calculateCostDetailed } from "../services/pricingService.js";
import { calculateInputTokens } from "../services/tokenService.js";
import { analyzeScenarios } from "../services/scenarioService.js";
import { env } from "../config/environment.js";

export async function handleReports(body = {}) {
    const checked = validateWorkloadRequest(body, env.RATE_USD_INR);
    if (!checked.ok) return { status: 400, json: { error: checked.error } };

    const inputs = checked.inputs;
    const model = getModel(inputs.modelId);
    if (!model) {
        return { status: 400, json: { error: `Unknown model "${inputs.modelId}". Select a model from the catalogue.` } };
    }

    try {
        const scenarios = analyzeScenarios({ ...inputs, fx: checked.rate });
        const inputEstimation = calculateInputTokens({
            prompt: inputs.prompt,
            fileText: inputs.fileText,
            fileMeta: inputs.fileMeta,
            parseMeta: inputs.parseMeta,
            files: inputs.files,
            model
        });
        const inputTokens = inputEstimation.tokens;
        const detailed = calculateCostDetailed(inputTokens, inputs.outputTokens, model, inputs.useCachedInput, inputs.pricingMode, checked.rate);
        return {
            status: 200,
            json: {
                scenarios,
                model: { id: model.id, name: model.name },
                totalTokens: inputTokens + inputs.outputTokens,
                costPerRequest: detailed.ok ? detailed.totalCost : null,
                currency: "INR",
                rate: checked.rate
            }
        };
    } catch (error) {
        console.error("POST /api/reports failed:", error);
        return { status: 500, json: { error: "Report generation failed unexpectedly." } };
    }
}
