/* =========================================================
   Shared estimate store. The calculator writes; Dashboard,
   Comparison, Suggestions and Report read. Emits
   "estimate:updated" on every write.
   ========================================================= */

import { timestamp } from "../utils/datetime.js";

const state = {
    result: null,
    comparisonRows: [],
    archivedRows: [],
    comparisonSummary: null,
    recommendation: null,
    scenarios: [],
    inputs: null,
    calculatedAt: null,
    report: null,
    reportedAt: null,
    activity: [],
    trend: []
};

export function getStore() {
    return state;
}

export function setEstimate({ result, comparisonRows = [], archivedRows = [], comparisonSummary = null, recommendation = null, scenarios = [], inputs = null }) {
    state.result = result;
    state.comparisonRows = comparisonRows;
    state.archivedRows = archivedRows;
    state.comparisonSummary = comparisonSummary;
    state.recommendation = recommendation;
    state.scenarios = scenarios;
    state.inputs = inputs;
    state.calculatedAt = timestamp();
    window.dispatchEvent(new CustomEvent("estimate:updated"));
}

export function markStale() {
    document.body.classList.add("results-stale");
}
export function clearStale() {
    document.body.classList.remove("results-stale");
}

/* Report snapshot: immutable once issued — later calculations must
   not mutate it (the service deep-copies on creation). */
export function setReport(snapshot) {
    state.report = snapshot;
    state.reportedAt = timestamp();
}

export function getReport() {
    return state.report;
}

/* Session activity (calculations, uploads) with runtime timestamps.
   Newest first, capped; empty until this session records operations. */
const MAX_ACTIVITY = 20;

export function logActivity({ type = "", title = "", detail = "", status = "" } = {}) {
    state.activity.unshift({ type, title, detail, status, ts: timestamp() });
    if (state.activity.length > MAX_ACTIVITY) state.activity.length = MAX_ACTIVITY;
}

export function getActivity() {
    return state.activity;
}

/* Session trend history: one point per calculation (oldest first,
   capped). Powers the dashboard Cost Trend chart with real data. */
const MAX_TREND = 30;

export function logTrendPoint({ monthlyCost = null, totalTokens = 0, modelName = "" } = {}) {
    state.trend.push({ monthlyCost, totalTokens, modelName, ts: timestamp() });
    if (state.trend.length > MAX_TREND) state.trend.splice(0, state.trend.length - MAX_TREND);
}

export function getTrend() {
    return state.trend;
}
