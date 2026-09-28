/* =========================================================
   Report service: snapshot + exports for the Report workflow.

   Single rule: NEVER recalculate. The snapshot deep-copies the
   already-calculated store bundle (result, comparison, scenarios,
   recommendations) plus the calculator's per-file entries. Every
   preview section and every export consumes that snapshot, so a
   later calculator change cannot mutate an issued report.

   PDF uses the print-stylesheet path (window.print → Save as PDF):
   this project has zero runtime dependencies and no PDF library
   is justified for a styled-document printout.
   ========================================================= */

import { getStore } from "../app/store.js";
import { getDisplayCurrency, getExchangeRate, getReferenceRate } from "../app/prefs.js";
import { timestamp } from "../utils/datetime.js";
import { showToast } from "../components/toasts.js";
import { SERVICE_CATEGORIES } from "../data/config.js";

const APP_VERSION = "3.0.0";
const REPORT_ID_PREFIX = "ACM";

const GPU_REFERENCE = Object.freeze({
    model: "NVIDIA H100",
    status: "Placeholder",
    costing: "Not included"
});

/* Report ID from the generation instant, e.g. ACM-20260910-143022.
   Local date parts (not UTC) so the ID matches the displayed time. */
function generateReportId(at = new Date()) {
    const d = new Date(at);
    const pad = (n) => String(n).padStart(2, "0");
    return `${REPORT_ID_PREFIX}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
        + `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function numOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/* Hard errors block snapshot creation; soft warnings render as-is. */
function validateReportData(state = getStore()) {
    const errors = [];
    const warnings = [];
    const result = state?.result;
    if (!result) {
        errors.push("No calculation result exists. Run the calculator first.");
        return { ok: false, errors, warnings };
    }
    if (!result.modelId) errors.push("Calculation result has no model.");
    if (result.inputEstimation == null) errors.push("Calculation result has no token estimation.");
    if (!Array.isArray(state.comparisonRows) || state.comparisonRows.length === 0) {
        warnings.push("Comparison data is empty — comparison sections will show N/A.");
    }
    if (!Array.isArray(state.scenarios) || state.scenarios.length === 0) {
        warnings.push("Scenario data is empty — scenario sections will show N/A.");
    }
    if (!state.recommendation) {
        warnings.push("No recommendation data — recommendation section will show N/A.");
    }
    return { ok: errors.length === 0, errors, warnings };
}

function fileStatus(entry) {
    if (!entry || entry.processing) return "Processing";
    if (entry.unsupported) return "Unsupported";
    if (!entry.success && (entry.tokens === null || entry.tokens === undefined)) return "Failed";
    if (!entry.success) return "Fallback";
    if (entry.warning) return "Warning";
    return "Parsed";
}

function snapshotFiles(fileData) {
    const entries = Array.isArray(fileData?.files) ? fileData.files : [];
    const stale = fileData?.staleBackend === true;
    return {
        staleBackend: stale,
        list: entries.map((e) => {
            const tokens = numOrNull(e?.tokens);
            const approximate = stale
                || e?.warning != null
                || e?.parserFailed === true
                || e?.source === "file-size";
            return {
                name: typeof e?.name === "string" && e.name ? e.name : "Unnamed file",
                size: numOrNull(e?.size) ?? 0,
                format: typeof e?.format === "string" && e.format ? e.format : "unknown",
                tokens,
                method: typeof e?.method === "string" && e.method ? e.method : null,
                source: typeof e?.source === "string" ? e.source : null,
                status: fileStatus(e),
                warning: typeof e?.warning === "string" ? e.warning : null,
                error: typeof e?.error === "string" ? e.error : null,
                approximate: Boolean(approximate && tokens !== null)
            };
        })
    };
}

/* The one and only snapshot constructor. Pure reshape of stored
   numbers — the only "math" is presentation rank/difference, the
   same display derivation the Leaderboard already performs. */
export function createReportSnapshot({ storeState = getStore(), fileData = { files: [], staleBackend: false }, generatedAt = timestamp() } = {}) {
    const validation = validateReportData(storeState);
    if (!validation.ok) return { ok: false, errors: validation.errors, warnings: validation.warnings, snapshot: null };

    const { result, comparisonRows = [], comparisonSummary = null, recommendation = null, scenarios = [], inputs = null } = storeState;
    const estimation = result.inputEstimation || {};
    const breakdown = estimation.breakdown || {};
    const promptEst = breakdown.prompt || {};
    const fileEst = breakdown.file || {};
    const costs = result.costBreakdown || {};
    const category = SERVICE_CATEGORIES.find((c) => c.id === (inputs?.serviceCategory || result.serviceCategory));

    const { list: files, staleBackend } = snapshotFiles(fileData);

    const selectedMonthly = numOrNull(result.monthlyCost);
    const pricedRows = comparisonRows.filter((r) => r && r.priced);
    const comparison = comparisonRows.map((row, index) => {
        const monthly = numOrNull(row.monthlyCost);
        const diff = (row.modelId !== result.modelId && monthly !== null && selectedMonthly !== null)
            ? monthly - selectedMonthly : null;
        return {
            rank: index + 1,
            modelId: row.modelId,
            modelName: row.modelName,
            provider: row.provider,
            family: row.family,
            requestCost: numOrNull(row.costPerRequest),
            monthlyCost: monthly,
            annualCost: numOrNull(row.annualCost),
            difference: diff,
            differencePct: (diff !== null && selectedMonthly > 0) ? (diff / selectedMonthly) * 100 : null,
            priced: row.priced === true,
            selected: row.modelId === result.modelId
        };
    });
    const selectedRank = result.modelId && pricedRows.some((r) => r.modelId === result.modelId)
        ? comparison.find((r) => r.modelId === result.modelId)?.rank ?? null
        : null;

    const support = comparisonSummary?.decisionSupport || null;
    const infra = result.infrastructureCost || null;
    const hasInfra = result.hasInfrastructure === true && infra && infra.monthlyInfrastructureCost !== null;
    const gpuSelected = hasInfra ? {
        model: infra.gpu || inputs?.gpuConfig?.gpuInstanceId || "Selected GPU",
        instanceId: infra.instanceId || inputs?.gpuConfig?.gpuInstanceId || null,
        source: infra.source || "indiaai",
        pricingTier: infra.pricingTier || inputs?.gpuConfig?.gpuPricingTier || "onDemand",
        hourlyCost: numOrNull(infra.hourlyCost),
        runtimeHours: numOrNull(infra.runtimeHours) ?? 0,
        monthlyCost: numOrNull(infra.monthlyInfrastructureCost),
        annualCost: numOrNull(infra.annualInfrastructureCost),
        costPerRequest: numOrNull(infra.costPerRequest),
        cards: numOrNull(infra.cards),
        memoryGB: numOrNull(infra.memoryGB),
        status: "Selected",
        costing: "Included"
    } : null;
    const snapshot = {
        report: {
            id: generateReportId(generatedAt),
            generatedAt,
            version: APP_VERSION,
            currency: result.currency || "INR",
            displayCurrency: safeDisplayCurrency()
        },
        context: {
            /* No department selector exists in the app — never fabricate. */
            department: "N/A",
            classification: category ? category.name : (inputs?.serviceCategory || result.serviceCategory || "N/A"),
            selectedModel: result.modelName || result.modelId,
            selectedModelId: result.modelId,
            provider: result.provider || "N/A",
            gpuReference: gpuSelected || { ...GPU_REFERENCE }
        },
        workload: {
            promptTokens: numOrNull(promptEst.tokens) ?? 0,
            fileTokens: numOrNull(fileEst.tokens) ?? 0,
            totalInputTokens: numOrNull(result.inputTokens) ?? 0,
            estimatedOutputTokens: numOrNull(result.outputTokens) ?? 0,
            totalEstimatedTokens: numOrNull(result.totalTokens) ?? 0,
            fileCount: files.length
        },
        files,
        selectedModelCost: {
            modelName: result.modelName || result.modelId,
            provider: result.provider || "N/A",
            priced: result.priced === true,
            pricingNote: result.pricingNote || result.error || null,
            inputRatePer1M: numOrNull(costs.inputRatePer1M),
            outputRatePer1M: numOrNull(costs.outputRatePer1M),
            inputTokens: numOrNull(result.inputTokens) ?? 0,
            outputTokens: numOrNull(result.outputTokens) ?? 0,
            inputCost: numOrNull(costs.inputCost),
            outputCost: numOrNull(costs.outputCost),
            totalRequestCost: numOrNull(result.costPerRequest),
            monthlyCost: selectedMonthly,
            annualCost: numOrNull(result.annualCost),
            /* V3: GPU totals only when a GPU is actually selected —
               keeps legacy no-GPU snapshots byte-compatible (no "gpu"
               substring inside selectedModelCost). */
            ...(hasInfra ? {
                gpu: gpuSelected,
                totalMonthlyCost: numOrNull(result.totalMonthlyCost),
                totalAnnualCost: numOrNull(result.totalAnnualCost)
            } : {}),
            monthlyRequests: numOrNull(result.monthlyRequests) ?? 0
        },
        comparison,
        rankings: {
            lowest: pricedRows.slice(0, 5).map((r) => pickRankRow(r, comparison)),
            highest: pricedRows.slice(-5).reverse().map((r) => pickRankRow(r, comparison)),
            selectedRank,
            totalRanked: comparisonRows.length
        },
        savings: support ? {
            currentMonthly: numOrNull(support.currentMonthlyCost),
            alternativeName: support.alternativeModelName || null,
            alternativeMonthly: numOrNull(support.alternativeMonthlyCost),
            savingMonthly: numOrNull(support.potentialMonthlySaving),
            savingAnnual: numOrNull(support.potentialAnnualSaving),
            savingPercent: selectedMonthly > 0 && support.potentialMonthlySaving != null
                ? (support.potentialMonthlySaving / selectedMonthly) * 100 : null,
            isAlreadyCheapest: support.isAlreadyCheapest === true
        } : null,
        scenarios: scenarios.map((s) => ({
            key: s.key,
            label: s.label,
            monthlyRequests: numOrNull(s.monthlyRequests) ?? 0,
            costPerRequest: numOrNull(s.costPerRequest),
            monthlyCost: numOrNull(s.monthlyCost),
            annualCost: numOrNull(s.annualCost)
        })),
        recommendations: recommendation ? {
            type: recommendation.type || null,
            /* No inner clone here — the outer clone(snapshot) below
               deep-copies everything exactly once. */
            summary: recommendation.summary || null,
            items: Array.isArray(recommendation.items) ? recommendation.items : []
        } : null,
        dataQuality: {
            hasFiles: files.length > 0,
            allParsed: files.length > 0 && files.every((f) => f.status === "Parsed"),
            warnings: files.filter((f) => f.warning).map((f) => ({ file: f.name, warning: f.warning })),
            fallbackFiles: files.filter((f) => f.status === "Fallback").map((f) => f.name),
            staleBackend,
            staleApproximate: staleBackend && files.length > 0
        },
        pricing: {
            provider: result.provider || "N/A",
            model: result.modelName || result.modelId,
            inputRatePer1M: numOrNull(costs.inputRatePer1M),
            outputRatePer1M: numOrNull(costs.outputRatePer1M),
            currency: result.currency || "INR",
            source: result.pricingSource || null,
            lastUpdated: result.pricingLastUpdated || null,
            tier: result.pricingTier || null,
            mode: result.pricingMode || null,
            version: APP_VERSION
        }
    };
    return { ok: true, errors: [], warnings: validation.warnings, snapshot: clone(snapshot) };
}

function pickRankRow(row, comparison) {
    const match = comparison.find((r) => r.modelId === row.modelId);
    return match ? {
        rank: match.rank, modelName: match.modelName, provider: match.provider,
        monthlyCost: match.monthlyCost, selected: match.selected
    } : { rank: null, modelName: row.modelName, provider: row.provider, monthlyCost: numOrNull(row.monthlyCost), selected: false };
}

/* Display-currency read with locked-down-context fallback. Shared by
   the CSV/pricing paths here and the report preview view. */
export function safeDisplayCurrency() {
    try {
        return getDisplayCurrency();
    } catch {
        return "INR";
    }
}

/* Display conversion for human-readable exports (preview uses
   formatCost for the same job). Snapshot numbers stay canonical INR;
   only the exported representation follows the toggle. Converted
   values round to 6dp (sub-cent); INR values pass through untouched. */
function toDisplayNumber(inrValue) {
    if (inrValue === null || inrValue === undefined) return null;
    const n = Number(inrValue);
    if (!Number.isFinite(n)) return null;
    if (safeDisplayCurrency() !== "USD") return n;
    return Math.round((n / getExchangeRate(getReferenceRate())) * 1e6) / 1e6;
}

/* ================= Exports (snapshot in, file/stdout out) ================= */

function buildReportJSON(snapshot) {
    return JSON.stringify(snapshot, null, 2);
}

function csvCell(value) {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvSection(title, headers, rows) {
    const lines = [`# ${title}`, headers.map(csvCell).join(",")];
    for (const row of rows) lines.push(row.map(csvCell).join(","));
    lines.push("");
    return lines.join("\n");
}

/* One readable CSV with labelled sections — workload, files,
   comparison, scenarios. Money follows the display toggle (see
   toDisplayNumber); tokens/counts are currency-free. Never a
   nested-JSON dump. */
function buildReportCSV(snapshot) {
    const w = snapshot.workload;
    const displayCurrency = safeDisplayCurrency();
    const money = (v) => {
        const n = toDisplayNumber(v);
        return n === null ? "N/A" : n;
    };
    const parts = [];
    const gpu = snapshot.selectedModelCost?.gpu || null;
    parts.push(csvSection(`Report ${snapshot.report.id} — generated ${snapshot.report.generatedAt}`, ["Field", "Value"], [
        ["Model", snapshot.context.selectedModel],
        ["Provider", snapshot.context.provider],
        ["Classification", snapshot.context.classification],
        ["Currency", displayCurrency],
        ["GPU", gpu ? `${gpu.model} (${gpu.pricingTier || "onDemand"})` : "None — API cost only"],
        ...(gpu ? [
            [`GPU hourly (${displayCurrency})`, money(gpu.hourlyCost)],
            ["GPU monthly", money(gpu.monthlyCost)],
            ["Combined monthly", money(snapshot.selectedModelCost?.totalMonthlyCost)]
        ] : [])
    ]));
    parts.push(csvSection("Workload summary", ["Metric", "Tokens"], [
        ["Prompt tokens", w.promptTokens],
        ["File tokens", w.fileTokens],
        ["Total input tokens", w.totalInputTokens],
        ["Estimated output tokens", w.estimatedOutputTokens],
        ["Total estimated tokens", w.totalEstimatedTokens],
        ["Number of files", w.fileCount]
    ]));
    parts.push(csvSection("File analysis", ["File", "Format", "Size (bytes)", "Tokens", "Method", "Status"], snapshot.files.map((f) => [
        f.name, f.format, f.size, f.tokens ?? "N/A", f.method || "N/A", f.status + (f.approximate ? " (approx.)" : "")
    ])));
    parts.push(csvSection("Model comparison", ["Rank", "Model", "Provider", `Request cost (${displayCurrency})`, `Monthly cost (${displayCurrency})`, "Difference vs selected", "Selected"], snapshot.comparison.map((r) => [
        r.rank, r.modelName, r.provider,
        money(r.requestCost), money(r.monthlyCost),
        money(r.difference), r.selected ? "yes" : ""
    ])));
    parts.push(csvSection("Scenarios", ["Scenario", "Requests/month", `Cost/request (${displayCurrency})`, `Monthly cost (${displayCurrency})`, `Annual cost (${displayCurrency})`], snapshot.scenarios.map((s) => [
        s.label, s.monthlyRequests, money(s.costPerRequest), money(s.monthlyCost), money(s.annualCost)
    ])));
    return parts.join("\n");
}

function reportFilename(snapshot, ext) {
    const id = snapshot?.report?.id || "report";
    return `report-${id}.${ext}`;
}

function downloadTextFile(filename, content, mime = "text/plain") {
    try {
        if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
            showToast("Download is not available in this environment.", "error");
            return false;
        }
        const blob = new Blob([content], { type: `${mime};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return true;
    } catch (error) {
        console.error("Download failed", error);
        try { showToast("Export failed. Please try again.", "error"); } catch { /* non-DOM */ }
        return false;
    }
}

export function exportReportJSON(snapshot) {
    if (!snapshot) {
        showToast("No report to export. Generate a report first.", "error");
        return false;
    }
    return downloadTextFile(reportFilename(snapshot, "json"), buildReportJSON(snapshot), "application/json");
}

export function exportReportCSV(snapshot) {
    if (!snapshot) {
        showToast("No report to export. Generate a report first.", "error");
        return false;
    }
    return downloadTextFile(reportFilename(snapshot, "csv"), buildReportCSV(snapshot), "text/csv");
}

export function printReport() {
    try {
        if (typeof window === "undefined" || typeof window.print !== "function") return false;
        window.print();
        return true;
    } catch (error) {
        console.error("Print failed", error);
        return false;
    }
}

/* PDF via the print stylesheet (Save as PDF). Sets the document title
   so the suggested filename matches the report ID, then restores it. */
export function exportReportPDF(snapshot) {
    if (!snapshot) {
        showToast("No report to export. Generate a report first.", "error");
        return false;
    }
    try {
        if (typeof document === "undefined") return false;
        const previous = document.title;
        document.title = reportFilename(snapshot, "pdf").replace(/\.pdf$/, "");
        const ok = printReport();
        document.title = previous;
        if (!ok) showToast("PDF export is not available in this environment.", "error");
        return ok;
    } catch (error) {
        console.error("PDF export failed", error);
        return false;
    }
}
