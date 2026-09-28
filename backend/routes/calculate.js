/* POST /api/calculate — full workload estimate. */

import { validateWorkloadRequest } from "../validation/schemas.js";
import { computeEstimate } from "../services/costService.js";
import { env } from "../config/environment.js";

export async function handleCalculate(body = {}) {
    const checked = validateWorkloadRequest(body, env.RATE_USD_INR);
    if (!checked.ok) return { status: 400, json: { error: checked.error } };

    try {
        const result = await computeEstimate({ ...checked.inputs, fx: checked.rate, currency: "INR" });
        return { status: 200, json: { result, rate: checked.rate, currency: "INR" } };
    } catch (error) {
        console.error("POST /api/calculate failed:", error);
        return { status: 500, json: { error: "Calculation failed unexpectedly." } };
    }
}
