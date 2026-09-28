/* =========================================================
   Thin calculation client. Orchestrates the three backend
   calls; owns no formulas. Returns one bundle for the store.
   ========================================================= */

import { fetchEstimate, fetchComparison, fetchReport } from "./api.js";
import { getDefaultOverrides } from "../app/prefs.js";

function withRate(payload) {
    const custom = Number(getDefaultOverrides().exchangeRate);
    return {
        ...payload,
        ...(Number.isFinite(custom) && custom > 0 ? { exchangeRate: custom } : {})
    };
}

export async function calculateTokens(inputs) {
    const data = await fetchEstimate(withRate(inputs));
    return data.result;
}

export async function calculateAll(inputs) {
    const [compared, reported] = await Promise.all([
        fetchComparison(withRate(inputs)),
        fetchReport(withRate(inputs))
    ]);
    return {
        result: compared.estimate,
        comparisonRows: compared.rows,
        archivedRows: compared.archivedRows || [],
        comparisonSummary: compared.summary,
        recommendation: compared.recommendation,
        scenarios: reported.scenarios
    };
}
