/* =========================================================
   Calculator: guided steps — 1 Input → 2 Token Analysis →
   3 Cost Result. Thin client: all math runs server-side via
   services/calculator.js. Writes the shared store.
   ========================================================= */

import { SERVICE_CATEGORIES, CALCULATION_DEFAULTS } from "../data/config.js";
import { $id, readIntInput, toFiniteNumber, setFieldError, showFormBanner, hideFormBanner, escapeHtml } from "../utils/dom.js";
import { formatInt, formatCost, formatBytes } from "../utils/format.js";
import { renderModelSelect, mountModelSelect } from "../components/model-select.js";
import { renderGpuSelect, mountGpuSelect } from "../components/gpu-select.js";
import { parseFile, fetchSizeEstimate, fetchTextTokens, FILE_STATUS, getFileStatusLabel, getFileStatusClass } from "../services/files.js";
import { getCachedConfig, getCachedModels } from "../services/api.js";
import { calculateTokens, calculateAll } from "../services/calculator.js";
import { setEstimate, markStale, clearStale, getStore, logActivity, logTrendPoint, setReport } from "../app/store.js";
import { createReportSnapshot } from "../services/report.js";import { getDefaultOverrides } from "../app/prefs.js";
import { estimationBadge } from "../components/badges.js";
import { quickFixPanel } from "../components/quick-fix.js";
import { showToast } from "../components/toasts.js";
import { icon } from "../components/icons.js";

let step = 1;
let hasCalculated = false;
/* Draft persists across step transitions (file inputs cannot be
   restored into <input type=file>, so the File objects are kept). */
let draft = null;
/* Multi-file upload state: one entry per file, each with its own File
   object, parse outcome and token estimate. Additive — new selections
   append, never replace. */
let uploadEntries = [];
let uploadIdSeq = 0;
/* In-flight parse tasks. The submit handler awaits these so a file can
   never be silently dropped from the calculation payload just because
   its parse had not finished when the user continued. Entries settle
   (and remove themselves) exactly once. */
const pendingParses = new Set();
let continuing = false;
/* Stale-backend guard: a server predating multi-file support silently
   drops the `files[]` payload (unknown field) and reports 0 file
   tokens. When detected we retry once with a legacy-compatible
   aggregate payload so Token Analysis still shows the real total, and
   tell the user to restart the backend for exact per-file accounting. */
let backendStaleFiles = false;
let staleToastShown = false;
/* Browser-performance guard: each file can trigger heavy local parsing
   (PDF/DOCX/OCR). Per-file size is still enforced via configMaxMB(). */
const MAX_FILES = 10;
let draftScenario = "current";

function configScenarios() {
    return getCachedConfig()?.scenarios || { current: { label: "Current Workload" } };
}

function configMaxMB() {
    const mb = Number(getCachedConfig()?.maxFileSizeMB);
    return Number.isFinite(mb) && mb > 0 ? mb : 50;
}

function stepperHtml() {
    const steps = ["Input", "Token Analysis", "Cost Result"];
    return `<div class="stepper" role="list" aria-label="Calculator progress">` + steps.map((label, i) => {
        const n = i + 1;
        const cls = n === step ? "current" : (n < step ? "done" : "");
        const state = n === step ? " (current step)" : (n < step ? " (completed)" : "");
        return `<div class="step ${cls}" role="listitem" aria-current="${n === step ? "step" : "false"}">
            <span class="step-num" aria-hidden="true">${n < step ? "✓" : n}</span>
            <span>${label}<span class="visually-hidden">${state}</span></span>
        </div>`;
    }).join("") + `</div>`;
}

function stepInputHtml() {
    const overrides = getDefaultOverrides();
    const outDefault = draft?.outputTokens ?? overrides.outputTokens ?? CALCULATION_DEFAULTS.outputTokens;
    const reqDefault = draft?.monthlyRequests ?? overrides.monthlyRequests ?? CALCULATION_DEFAULTS.monthlyRequests;
    const scenarios = Object.entries(configScenarios()).map(([key, s]) =>
        `<option value="${key}"${(draftScenario === key) ? " selected" : ""}>${escapeHtml(s.label)}</option>`).join("");
    const categoryOptions = SERVICE_CATEGORIES.map((c) =>
        `<option value="${c.id}"${draft?.serviceCategory === c.id ? " selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
    const promptValue = draft ? escapeHtml(draft.prompt) : "";
    const gpuHoursValue = draft?.gpuConfig?.runtimeHours ?? 24;
    const gpuInstanceId = draft?.gpuConfig?.gpuInstanceId || "";
    return `
        <form id="calcForm" novalidate>
            <div class="form-section">
            <h3 class="form-section-title"><span class="form-section-num" aria-hidden="true">01</span>What are we pricing? <span class="form-section-hint">Required</span></h3>
            <div class="form-grid">
                <div class="field">
                    <label for="calcCategory">Service Classification <span class="required-mark" aria-hidden="true">*</span></label>
                    <select id="calcCategory" required aria-describedby="calcCategoryHelp"><option value="">Select classification</option>${categoryOptions}</select>
                    <small class="required-message" id="calcCategoryHelp">This is mandatory to fill</small>
                </div>
                <div class="field">
                    <label for="calcModelBtn">AI Model <span class="required-mark" aria-hidden="true">*</span></label>
                    <div id="modelSelectWrap">${renderModelSelect(draft?.modelId || "")}</div>
                </div>
            </div>
            <div class="form-grid">
                <div class="field">
                    <label for="calcGpuBtn">GPU Model <span class="label-hint">optional — IndiaAI</span></label>
                    <div id="gpuSelectWrap">${renderGpuSelect(gpuInstanceId)}</div>
                    <small class="field-help">Adds IndiaAI infrastructure cost alongside the API estimate.</small>
                </div>
                <div class="field">
                    <label for="gpuHoursMain">GPU Runtime Hours / Day <span class="label-hint">optional</span></label>
                    <input id="gpuHoursMain" type="number" value="${gpuHoursValue}" min="0" inputmode="numeric">
                    <small class="field-help">Applies when a GPU is selected. 0 = no infrastructure cost.</small>
                </div>
            </div>
            </div>
            <div class="form-section">
            <h3 class="form-section-title"><span class="form-section-num" aria-hidden="true">02</span>Describe the workload <span class="form-section-hint">Prompt, file, or both</span></h3>
            <div class="field">
                <label for="fileUpload" id="uploadLabel">Upload workload files <span class="label-hint">optional — or drop them here</span></label>
                <div class="upload-zone" id="uploadZone" role="button" tabindex="0" aria-labelledby="uploadLabel">
                    <input type="file" id="fileUpload" accept=".pdf,.docx,.txt,.xlsx,.csv,.pptx,.png,.jpg,.jpeg,.webp,.json,.xml,.md" hidden multiple>
                    <span class="upload-icon" aria-hidden="true">${icon("upload")}</span>
                    <span class="upload-text"><strong>Upload workload files</strong>
                    <small>PDF, DOCX, TXT, XLSX, CSV, PPTX, images, JSON, XML, MD — extracted with a local fallback. You can select multiple files.</small></span>
                </div>
                <div class="file-info" id="fileInfo" role="status">No file selected</div>
            </div>
            <div class="field">
                <div class="label-row">
                    <label for="calcPrompt">Prompt / instructions <span class="label-hint">optional</span></label>
                    <span id="promptCounter" class="char-counter">0 characters</span>
                </div>
                <textarea id="calcPrompt" placeholder="Enter the instructions your AI workload will process...">${promptValue}</textarea>
            </div>
            </div>
            <div class="form-section">
            <h3 class="form-section-title"><span class="form-section-num" aria-hidden="true">03</span>Scale &amp; options <span class="form-section-hint">Optional — defaults apply</span></h3>
            <div class="form-grid">
                <div class="field">
                    <label for="calcOutput">Expected output tokens <span class="label-hint">optional</span></label>
                    <input id="calcOutput" type="number" value="${outDefault}" min="1" inputmode="numeric">
                    <small class="field-help">Tokens the model is expected to generate per request.</small>
                </div>
                <div class="field">
                    <label for="calcRequests">Monthly requests <span class="label-hint">optional</span></label>
                    <input id="calcRequests" type="number" value="${reqDefault}" min="1" inputmode="numeric">
                    <small class="field-help">Used for monthly and annual projections.</small>
                </div>
            </div>
            <div class="field">
                <label for="calcScenario">Usage scenario preset <span class="label-hint">optional</span></label>
                <select id="calcScenario">${scenarios}</select>
                <small class="field-help">Applies a preset monthly request volume.</small>
            </div>
            <div class="field">
                <label class="checkbox-label"><input type="checkbox" id="calcCached"${draft?.useCachedInput ? " checked" : ""}>
                <span>Use cached input pricing (where available)</span></label>
                <small class="field-help">Discounted pricing for repeated prompt prefixes.</small>
            </div>
            </div>
            <div class="action-bar">
                <button type="submit" class="btn btn-primary">Continue to Token Analysis <span class="btn-arrow" aria-hidden="true">→</span></button>
            </div>
        </form>`;
}

/* Quick Fixation side panel: compact live summary. Before any
   calculation every value is "-". After calculation all values come
   from the real store/engine (draft + result + cached models) —
   never hardcoded. Re-renders with the view (steps, calc, currency
   toggle via renderRoute). */
function quickFixHtml() {
    const { result, comparisonSummary } = getStore();
    const params = {};
    if (result) {
        const cat = SERVICE_CATEGORIES.find((c) => c.id === draft?.serviceCategory);
        params.classification = cat ? cat.name : "-";
        params.model = result.modelName || "-";
        params.tokens = formatInt(result.totalTokens);
        params.cost = formatCost(result.costPerRequest);
        const meta = getCachedModels()?.models.find((m) => m.id === result.modelId);
        params.performance = meta?.contextWindow ? `${formatInt(meta.contextWindow)} ctx` : "-";
        const support = comparisonSummary?.decisionSupport;
        params.insight = (support && support.potentialMonthlySaving > 0 && support.alternativeModelName)
            ? `Potential saving ${formatCost(support.potentialMonthlySaving)}/mo with ${support.alternativeModelName} — see Comparison.`
            : "See Comparison and Suggestions for optimization.";
    }
    return quickFixPanel(params);
}

export function render() {
    const head = `
        <div class="view-head calc-head">
            <h2>Calculator</h2>
            <p>Estimate your AI usage cost, token consumption and get smart suggestions.</p>
        </div>`;
    if (step === 1) {
        return `${head}${stepperHtml()}<div class="calc-layout"><section class="panel calc-main" aria-label="Step 1: workload input">${stepInputHtml()}</section>${quickFixHtml()}</div>`;
    }
    if (step === 2) {
        return `${head}${stepperHtml()}<div class="calc-layout"><section class="panel calc-main" aria-label="Step 2: token analysis">
            <div class="panel-head"><h3>Token Analysis</h3><p>What was detected, and how it breaks down.</p></div>
            <div id="tokenAnalysis"><div class="skeleton" style="height:6rem" role="status" aria-label="Analyzing tokens"></div></div>
            <div class="btn-row">
                <button type="button" class="btn btn-ghost" id="backToInput">Back</button>
                <button type="button" class="btn btn-primary" id="runCalc">Calculate Cost <span class="btn-arrow" aria-hidden="true">→</span></button>
            </div>
        </section>${quickFixHtml()}</div>`;
    }
    const stored = getStore().result;
    const canReport = !!stored;
    return `${head}${stepperHtml()}<div class="calc-layout"><section class="panel calc-main" data-results aria-label="Step 3: cost result">
        <div class="panel-head"><h3>Cost Result${stored ? ` — ${escapeHtml(stored.modelName)}` : ""}</h3></div>
        <div id="costResult"></div>
        <div class="btn-row">
            <button type="button" class="btn btn-ghost" id="backToTokens">Back</button>
            <a class="btn btn-ghost" href="#/comparison">Compare Models</a>
            <a class="btn btn-ghost" href="#/suggestions">Suggestions</a>
            <button type="button" class="btn btn-primary" id="genReport"${canReport ? "" : " disabled"}>Generate Report</button>
        </div>
        <p id="staleNotice" class="stale-notice" role="status" hidden>Inputs changed since the last calculation — re-run to refresh.</p>
    </section>${quickFixHtml()}</div>`;
}

/* ================= INPUT HELPERS ================= */

function readInputs() {
    return {
        serviceCategory: $id("calcCategory")?.value || "",
        modelId: $id("calcModel")?.value || "",
        prompt: $id("calcPrompt")?.value || "",
        outputTokens: readIntInput($id("calcOutput"), CALCULATION_DEFAULTS.outputTokens),
        monthlyRequests: readIntInput($id("calcRequests"), CALCULATION_DEFAULTS.monthlyRequests),
        useCachedInput: $id("calcCached")?.checked || false,
        gpuConfig: readGpuConfig()
    };
}

function readGpuConfig() {
    const instanceId = $id("calcGpuInstance")?.value || null;
    const runtimeHours = toFiniteNumber($id("gpuHoursMain")?.value);
    if (!instanceId) return null;
    /* Nullish (not ||): an explicit 0 runtime must survive — the backend
       treats 0 hours as "no infrastructure cost" instead of the 24h default. */
    return {
        gpuInstanceId: instanceId,
        gpuPricingTier: "onDemand",
        hourlyCost: null,
        runtimeHours: runtimeHours ?? 24
    };
}

/* Serializable API payload from the draft (+ live per-file outcomes).
   Submit awaits in-flight parses first, so every uploaded file is
   included; only an entry added after Continue was clicked could still
   be parsing here, and those are excluded as before. */
function apiPayload() {
    /* Estimate refs (server-cached parse text) keep calculate payloads
       tiny no matter how big the files are; older backends without the
       estimateRefs capability still get the full text. */
    const canRef = !!getCachedConfig()?.estimateRefs;
    const files = uploadEntries
        .filter((e) => e.outcome && !e.outcome.processing)
        .map((e) => {
            const result = e.outcome.result || null;
            const ref = canRef ? (e.outcome.ref || e.outcome.tokens?.ref || null) : null;
            return {
                fileRef: ref,
                fileText: ref ? null : (result?.text ?? null),
                fileMeta: { name: e.file.name, size: e.file.size },
                parseMeta: result ? {
                    success: result.success,
                    format: result.format,
                    source: result.source,
                    characterCount: result.characterCount,
                    wordCount: result.wordCount,
                    pageCount: result.pageCount,
                    imageWidth: result.imageWidth,
                    imageHeight: result.imageHeight,
                    warning: result.warning,
                    error: result.error
                } : null
            };
        });
    return {
        serviceCategory: draft.serviceCategory,
        modelId: draft.modelId,
        prompt: draft.prompt,
        fileText: null,
        fileMeta: null,
        parseMeta: null,
        files,
        outputTokens: draft.outputTokens,
        monthlyRequests: draft.monthlyRequests,
        useCachedInput: draft.useCachedInput,
        pricingMode: "standard",
        gpuConfig: draft.gpuConfig
    };
}

/* Payload actually sent: exact per-file form, unless a stale backend
   was detected — then the legacy-compatible aggregate below. */
function effectivePayload() {
    return backendStaleFiles ? legacyAggregatePayload() : apiPayload();
}

/* Legacy-compatible aggregate for pre-multi-file backends: the same
   shape the old single-file flow sent, combining all completed files.
   Successful texts are concatenated (server heuristic then measures
   the real total within rounding); with no usable text the combined
   size falls back exactly like a single failed file did. */
function legacyAggregatePayload() {
    const done = uploadEntries.filter((e) => e.outcome && !e.outcome.processing);
    const usable = done.filter((e) =>
        e.outcome.result?.success && typeof e.outcome.result.text === "string" && e.outcome.result.text.length > 0);
    const totalSize = done.reduce((sum, e) => sum + (e.file.size || 0), 0);
    const totalChars = usable.reduce((sum, e) => sum + (e.outcome.result.characterCount || 0), 0);
    const totalWords = usable.reduce((sum, e) => sum + (e.outcome.result.wordCount || 0), 0);
    const base = {
        serviceCategory: draft.serviceCategory,
        modelId: draft.modelId,
        prompt: draft.prompt,
        files: [],
        outputTokens: draft.outputTokens,
        monthlyRequests: draft.monthlyRequests,
        useCachedInput: draft.useCachedInput,
        pricingMode: "standard",
        gpuConfig: draft.gpuConfig
    };
    if (usable.length === 0) {
        const firstError = done.map((e) => e.outcome.result?.error).find(Boolean)
            || "Files could not be parsed.";
        return {
            ...base,
            fileText: null,
            fileMeta: done.length > 0 ? { name: "combined-files", size: totalSize } : null,
            parseMeta: done.length > 0 ? {
                success: false, format: "mixed", source: null,
                characterCount: null, wordCount: null, pageCount: null,
                imageWidth: null, imageHeight: null, warning: null, error: firstError
            } : null
        };
    }
    return {
        ...base,
        fileText: usable.map((e) => e.outcome.result.text).join("\n\n"),
        fileMeta: { name: "combined-files", size: totalSize },
        parseMeta: {
            success: true, format: "mixed", source: "content",
            characterCount: totalChars, wordCount: totalWords || null, pageCount: null,
            imageWidth: null, imageHeight: null,
            warning: usable.length < done.length
                ? "Some files were excluded from this approximate total."
                : null,
            error: null
        }
    };
}

/* True when we sent files[] but the response carries no per-file
   breakdown — i.e. the backend predates multi-file support. */
function isStaleFilesResponse(sentFiles, result) {
    return (sentFiles?.length || 0) > 0
        && !!result?.inputEstimation
        && !Array.isArray(result.inputEstimation.breakdown?.files);
}

function notifyStaleBackend() {
    if (staleToastShown) return;
    staleToastShown = true;
    showToast("Calculation backend is outdated — restart it for exact per-file accounting. Showing approximate file totals.", "error");
}

/* ================= VALIDATION ================= */

function validateRequired() {
    const category = $id("calcCategory");
    const modelBtn = $id("calcModelBtn");
    const missingCategory = !category?.value;
    const missingModel = !$id("calcModel")?.value;
    setFieldError(category, missingCategory);
    setFieldError(modelBtn, missingModel);
    if (missingCategory || missingModel) {
        showFormBanner("Select a service classification and an AI model before continuing.");
        (missingCategory ? category : modelBtn)?.focus();
        return false;
    }
    hideFormBanner();
    return true;
}

/* ================= FILE DISPLAY (MULTI-FILE) ================= */

function fileIdentity(file) {
    return `${file.name}::${file.size}::${file.lastModified ?? "na"}`;
}

function getEntry(id) {
    return uploadEntries.find((e) => e.id === id) || null;
}

/* Serializable per-file snapshot for the Report workflow. Pure data —
   no File objects, no live outcomes — so an issued report can never
   change when the upload list changes afterwards. */
function getFileEntriesForReport() {
    return {
        staleBackend: backendStaleFiles,
        files: uploadEntries.map((e) => {
            const settled = !!(e.outcome && !e.outcome.processing);
            const result = settled ? e.outcome.result : null;
            const tokens = settled ? e.outcome.tokens : null;
            const tokenCount = tokens && Number.isFinite(Number(tokens.tokens)) ? Number(tokens.tokens) : null;
            return {
                name: e.file?.name || "Unnamed file",
                size: Number.isFinite(Number(e.file?.size)) ? Number(e.file.size) : 0,
                format: (String(e.file?.name || "").split(".").pop() || "").toLowerCase() || "unknown",
                tokens: tokenCount,
                method: tokens?.method || null,
                source: result?.source || tokens?.source || null,
                success: result?.success === true,
                unsupported: result?.unsupported === true,
                warning: result?.warning || null,
                error: result?.error || (!settled ? "File was still processing." : null),
                parserFailed: tokens?.parserFailed === true,
                processing: !settled
            };
        })
    };
}

function fileMainHtml(file, entryId) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "unknown";
    return `
        <div class="file-main">
            <button type="button" class="file-remove" data-action="remove-file" data-entry-id="${entryId}" aria-label="Remove file" title="Remove file">×</button>
            <span class="file-name">${escapeHtml(file.name)}</span>
            <span class="file-size">${formatBytes(file.size)}</span>
            <span class="file-type">${escapeHtml(ext.toUpperCase())}</span>
        </div>`;
}

/* Per-file status block. Same labels/classes as the old single-file
   card — one failed file never affects its siblings. */
function fileStatusHtml(outcome) {
    if (!outcome || outcome.processing) {
        return `<div class="file-status ${getFileStatusClass(FILE_STATUS.PROCESSING)}"><span class="status-dot" aria-hidden="true"></span>${escapeHtml(getFileStatusLabel(FILE_STATUS.PROCESSING))}</div>
            ${outcome?.message ? `<small class="file-support-note">${escapeHtml(outcome.message)}</small>` : ""}`;
    }
    const result = outcome.result;
    const tokens = outcome.tokens;
    if (!result || (!result.success && result.unsupported)) {
        return `<div class="file-status ${getFileStatusClass(FILE_STATUS.UNSUPPORTED)}"><span class="status-dot" aria-hidden="true"></span>${escapeHtml(getFileStatusLabel(FILE_STATUS.UNSUPPORTED))}</div>
            <div class="file-estimate"><span class="estimate-warning">${escapeHtml(result?.error || "Format not supported.")}</span></div>`;
    }
    if (!result.success) {
        let html = `<div class="file-status ${getFileStatusClass(FILE_STATUS.FAILED)}"><span class="status-dot" aria-hidden="true"></span>${escapeHtml(getFileStatusLabel(FILE_STATUS.FAILED))}</div>
            <div class="file-estimate"><span class="estimate-warning">${escapeHtml(result.error)}</span></div>`;
        if (tokens && tokens.tokens > 0) {
            html += `<div class="file-estimate"><span>Size-based fallback: ~${formatInt(tokens.tokens)} tokens</span>
                <span class="estimate-warning">(content was not readable — may differ significantly)</span></div>`;
        }
        /* The note claims the server is down, so show it only when a
           server call actually failed (tracked as serverUnreachable) —
           local image OCR with a working size fallback must not allege it. */
        if (outcome.serverUnreachable) {
            html += `<small class="file-support-note">Parsed in your browser (server unavailable).</small>`;
        }
        return html;
    }
    const label = getFileStatusLabel(FILE_STATUS.COMPLETED);
    let html = `<div class="file-status ${getFileStatusClass(FILE_STATUS.COMPLETED)}"><span class="status-dot" aria-hidden="true"></span>${escapeHtml(label)}</div>`;
    if (result.source === "ocr") {
        html += `<div class="file-extracted"><span>Image processed:</span>
            ${result.imageWidth ? `<span>${result.imageWidth}×${result.imageHeight}px</span>` : ""}
            ${result.characterCount ? `<span>OCR text: ${formatInt(result.characterCount)} chars</span>` : ""}
            <span>Image tokens: ~${formatInt(tokens?.tokens || 0)}</span></div>
            <small class="file-support-note">Tile-based approximation. OCR text is context only.</small>`;
    } else {
        html += `<div class="file-extracted"><span>Content extracted:</span>
            <span>${formatInt(result.characterCount || 0)} characters</span>
            ${result.wordCount ? `<span>${formatInt(result.wordCount)} words</span>` : ""}
            ${result.pageCount ? `<span>${result.pageCount} ${result.format === "pptx" ? "slides" : result.format === "xlsx" ? "sheets" : "pages"}</span>` : ""}
            <span>~${formatInt(tokens?.tokens || 0)} estimated tokens</span></div>`;
    }
    if (result.warning) html += `<small class="file-support-note">⚠ ${escapeHtml(result.warning)}</small>`;
    if (outcome.serverUnreachable) {
        html += `<small class="file-support-note">Parsed in your browser (server unavailable).</small>`;
    }
    return html;
}

function renderFileList() {
    const infoEl = $id("fileInfo");
    if (!infoEl) return;
    if (uploadEntries.length === 0) {
        infoEl.innerHTML = '<span class="file-status">No file selected</span>';
        return;
    }
    infoEl.innerHTML = `<div class="file-list">` + uploadEntries.map((entry) => `
        <div class="file-row" data-entry-row="${entry.id}">
            ${fileMainHtml(entry.file, entry.id)}
            ${fileStatusHtml(entry.outcome)}
        </div>`).join("") + `</div>`;
    infoEl.querySelectorAll?.('[data-action="remove-file"]')?.forEach?.((btn) => {
        btn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            removeUploadEntry(Number(btn.getAttribute("data-entry-id")));
        });
    });
}

/* Single choke-point for file removal: drops only the targeted entry —
   its File object, parsed content, token estimate, metadata, parser and
   warning/error state — then re-renders. Siblings are untouched.
   Idempotent (safe on repeated clicks). When the last file goes, the
   upload area returns to its empty state. Leaves model/department/
   theme and other settings untouched. */
function removeUploadEntry(id) {
    const index = uploadEntries.findIndex((e) => e.id === id);
    if (index < 0) return;
    uploadEntries.splice(index, 1);
    backendStaleFiles = false; // file set changed — re-probe backend support
    const input = $id("fileUpload");
    /* Resetting the input value is what allows re-uploading the SAME
       file again (otherwise `change` would not fire). */
    if (input) input.value = "";
    renderFileList();
    flagStale();
}

function logUploadActivity(file, outcome) {
    if (!file || !outcome) return;
    const result = outcome.result;
    const ext = (file.name.split(".").pop() || "file").toUpperCase();
    logActivity({
        type: "upload",
        title: file.name,
        detail: `${ext} · ${formatBytes(file.size)}`,
        status: !result ? "Failed" : result.unsupported ? "Unsupported" : result.success ? "Parsed" : "Failed"
    });
}

/* Additive multi-file selection: new picks append to the existing
   list, never replace it. Cancelling the dialog (empty pick) keeps
   everything. Each file is validated and processed independently, so
   one bad file never blocks its siblings. */
function handleFilesSelect(fileList) {
    const picked = Array.from(fileList || []).filter(Boolean);
    if (picked.length === 0) return;
    backendStaleFiles = false; // file set changed — re-probe backend support
    const maxMB = configMaxMB();
    for (const file of picked) {
        const identity = fileIdentity(file);
        if (uploadEntries.some((e) => fileIdentity(e.file) === identity)) {
            showToast(`"${file.name}" is already uploaded.`, "error");
            continue;
        }
        if (uploadEntries.length >= MAX_FILES) {
            showToast(`Maximum ${MAX_FILES} files per calculation — "${file.name}" was skipped.`, "error");
            continue;
        }
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        if (file.size > maxMB * 1024 * 1024) {
            uploadEntries.push({
                id: ++uploadIdSeq,
                file,
                outcome: { result: {
                    success: false, format: "unknown", source: null, text: null,
                    characterCount: null, wordCount: null, pageCount: null,
                    imageWidth: null, imageHeight: null, ocrText: false,
                    warning: null, error: `File exceeds the ${maxMB} MB limit.`
                }, tokens: null }
            });
            logActivity({ type: "upload", title: file.name, detail: `Exceeds the ${maxMB} MB limit`, status: "Failed" });
            showToast("File is too large.", "error");
            continue;
        }
        const entry = {
            id: ++uploadIdSeq,
            file,
            outcome: { processing: true, message: `Parsing ${(ext || "file").toUpperCase()} — extracting content…` }
        };
        uploadEntries.push(entry);
        trackParse(entry);
    }
    const input = $id("fileUpload");
    if (input) input.value = "";
    renderFileList();
    flagStale();
}

/* Starts one entry's parse exactly once and tracks it until it
   settles, so submit can await every in-flight file. Never rejects. */
function trackParse(entry) {
    const task = processEntry(entry).catch(() => {});
    pendingParses.add(task);
    task.finally(() => pendingParses.delete(task));
}

/* Parses one entry exactly once and stores its outcome in place (never
   appended twice). Entry-identity guards drop stale chains when the
   file is removed mid-parse, so the empty state is never resurrected. */
async function processEntry(entry) {
    const file = entry.file;
    const modelId = $id("calcModel")?.value || draft?.modelId || null;
    let outcome;
    try {
        outcome = await parseFile(file, modelId);
    } catch (error) {
        if (getEntry(entry.id) !== entry) return;
        outcome = { result: null, tokens: null, fallback: false };
        showToast(error?.message || "File processing failed.", "error");
    }
    if (getEntry(entry.id) !== entry) return;
    entry.outcome = outcome;

    if (outcome.result && !outcome.result.success && outcome.result.unsupported) {
        renderFileList();
        logUploadActivity(file, outcome);
        flagStale();
        return;
    }
    // Local fallback without server tokens → ask the server for the estimate.
    if (outcome.result?.success && !outcome.tokens && outcome.local) {
        try {
            const text = outcome.result.text;
            const r = outcome.result;
            const fetched = await fetchTextTokens({
                filename: file.name,
                text: text || "",
                parseMeta: {
                    success: true, format: r.format, source: r.source,
                    characterCount: r.characterCount, wordCount: r.wordCount,
                    pageCount: r.pageCount, imageWidth: r.imageWidth,
                    imageHeight: r.imageHeight, warning: r.warning, error: null
                },
                modelId
            });
            if (getEntry(entry.id) !== entry) return;
            if (fetched) outcome.tokens = fetched;
        } catch {
            if (getEntry(entry.id) !== entry) return;
            outcome.serverUnreachable = true;
            /* display without token counts */
        }
    }
    if (outcome.result && !outcome.result.success && !outcome.tokens) {
        try {
            const fallbackTokens = await fetchSizeEstimate(file.name, file.size);
            if (getEntry(entry.id) !== entry) return;
            outcome.tokens = fallbackTokens;
        } catch {
            if (getEntry(entry.id) !== entry) return;
            outcome.serverUnreachable = true;
            /* display without fallback numbers */
        }
        if (!outcome.tokens) showToast(`"${file.name}": content extraction failed.`, "error");
        else showToast(`"${file.name}": extraction failed — size-based fallback will be used.`, "error");
    }
    if (getEntry(entry.id) !== entry) return;
    renderFileList();
    logUploadActivity(file, outcome);
    flagStale();
}

/* ================= TOKEN ANALYSIS ================= */

async function renderTokenAnalysis() {
    const container = $id("tokenAnalysis");
    if (!container || !draft) return;
    let payload = effectivePayload();
    let sentFiles = payload.files || [];
    let result;
    try {
        result = await calculateTokens(payload);
        if (!backendStaleFiles && isStaleFilesResponse(sentFiles, result)) {
            backendStaleFiles = true;
            notifyStaleBackend();
            payload = legacyAggregatePayload();
            sentFiles = [];
            result = await calculateTokens(payload);
        }
    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>Analysis failed</strong>
                <p>${escapeHtml(error?.message || "Could not reach the calculation backend.")}</p>
                <div class="btn-row" style="justify-content:center">
                    <button type="button" class="btn btn-primary" id="retryAnalysis">Retry</button>
                </div>
            </div>`;
        $id("retryAnalysis")?.addEventListener("click", renderTokenAnalysis);
        return;
    }
    const estimation = result.inputEstimation;
    const promptEst = estimation.breakdown.prompt;
    const fileEst = estimation.breakdown.file;
    const serverFiles = Array.isArray(estimation.breakdown.files) ? estimation.breakdown.files : null;
    const total = estimation.tokens + draft.outputTokens;
    const inputPct = total ? Math.round((estimation.tokens / total) * 100) : 0;

    let fileHtml = "";
    if (serverFiles && serverFiles.length > 0) {        /* Multi-file breakdown: one row per file (server tokens are
           authoritative for the selected model), names matched by order
           with a fallback to the reported name. */
        fileHtml = serverFiles.map((f, i) => {
            const name = uploadEntries[i]?.file?.name || f.name || `File ${i + 1}`;
            return `
            <div class="token-detail-item">
                <span class="token-detail-label">${escapeHtml(name)} ${estimationBadge(f.source)}</span>
                <div><strong>${formatInt(f.tokens)}</strong></div>
                ${f.note ? `<small class="token-detail-meta warning">${escapeHtml(f.note)}</small>` : ""}
            </div>`;
        }).join("");
    } else if (backendStaleFiles && uploadEntries.some((e) => e.outcome && !e.outcome.processing)) {
        /* Stale backend: no per-file breakdown available — show the
           approximate aggregate (retry payload) as one honest row. */
        const completedCount = uploadEntries.filter((e) => e.outcome && !e.outcome.processing).length;
        fileHtml = `
            <div class="token-detail-item">
                <span class="token-detail-label">Uploaded files (${completedCount}) ${estimationBadge(fileEst?.source)}</span>
                <div><strong>${formatInt(fileEst?.tokens || 0)}</strong></div>
                <small class="token-detail-meta warning">Approximate total — restart the backend for exact per-file accounting.</small>
            </div>`;
    } else if (fileEst && fileEst.tokens > 0) {
        let meta;
        if (fileEst.source === "image") {
            meta = [
                fileEst.imageWidth ? `${fileEst.imageWidth}×${fileEst.imageHeight}px` : null,
                fileEst.ocrChars ? `OCR: ~${formatInt(fileEst.ocrTokens || 0)} tokens (context only)` : null,
                escapeHtml(fileEst.method || "image estimate")
            ].filter(Boolean).join(" · ");
        } else if (fileEst.source === "extracted") {
            meta = `${formatInt(fileEst.extractedChars || 0)} extracted characters · ${escapeHtml(fileEst.method || "extracted")}`;
        } else {
            meta = `${fileEst.fileSize ? formatBytes(fileEst.fileSize) : ""} · ${(fileEst.fileType || "").toUpperCase()} · ${fileEst.bytesPerToken ?? "-"} bytes/token`;
        }
        fileHtml = `
            <div class="token-detail-item">
                <span class="token-detail-label">Uploaded file</span>
                <div><strong>${formatInt(fileEst.tokens)}</strong>${estimationBadge(fileEst.source)}</div>
                <small class="token-detail-meta">${meta}</small>
                ${fileEst.note ? `<small class="token-detail-meta warning">${escapeHtml(fileEst.note)}</small>` : ""}
            </div>`;
    }

    container.innerHTML = `
        <div class="metric-tiles reveal">
            <div class="metric-tile"><span>Prompt tokens</span><strong>${formatInt(promptEst?.tokens || 0)}</strong></div>
            <div class="metric-tile"><span>File tokens</span><strong>${formatInt(fileEst?.tokens || 0)}</strong></div>
            <div class="metric-tile total"><span>Total input</span><strong>${formatInt(estimation.tokens)}</strong></div>
        </div>
        <div class="composition-bar" role="img" aria-label="${inputPct}% input tokens, ${100 - inputPct}% output tokens">
            <span class="composition-input" style="width:${inputPct}%"></span>
            <span class="composition-output" style="width:${100 - inputPct}%"></span>
        </div>
        <div class="composition-legend"><span><i class="legend-input"></i>Input ${inputPct}%</span><span><i class="legend-output"></i>Output ${100 - inputPct}%</span></div>
        <details class="token-detail"><summary>Token estimation details</summary>
            <div class="token-detail-grid">
                <div class="token-detail-item">
                    <span class="token-detail-label">Prompt text ${estimationBadge(promptEst?.source)}</span>
                    ${promptEst?.chars ? `<small class="token-detail-meta" title="${escapeHtml(promptEst.method || "")}">${formatInt(promptEst.chars)} characters @ ${promptEst.charsPerToken} chars/token · provider-calibrated estimate</small>` : ""}
                </div>
                ${fileHtml}
                <div class="token-detail-item total">
                    <span class="token-detail-label">Total tokens / request</span>
                    <div><strong>${formatInt(total)}</strong></div>
                </div>
            </div>
        </details>`;
}

/* ================= COST RESULT ================= */

function renderCostResult() {
    const container = $id("costResult");
    const result = getStore().result;
    if (!container || !result) return;
    const per1K = result.costPer1KTokens !== null ? formatCost(result.costPer1KTokens) : "-";
    const per1M = result.costPer1MTokens !== null ? formatCost(result.costPer1MTokens) : "-";
    const sourceNote = result.pricingSource
        ? `Pricing source: ${result.pricingSource} · verified ${result.pricingLastUpdated || "unknown"}`
        : "Pricing source unavailable.";
    const tierNote = result.pricingTier && result.pricingTier !== "standard" ? ` · tier: ${result.pricingTier}` : "";
    const modeNote = result.pricingMode && result.pricingMode !== "standard" ? ` · mode: ${result.pricingMode}` : "";
    /* Token display is pricing-independent — rendered once for both branches. */
    const tokensHtml = `
            <div class="result-section">
                <h4 class="result-section-title">Tokens</h4>
                <div class="metric-tiles">
                    <div class="metric-tile"><span>Input</span><strong>${formatInt(result.inputTokens)}</strong></div>
                    <div class="metric-tile"><span>Output</span><strong>${formatInt(result.outputTokens)}</strong></div>
                    <div class="metric-tile total"><span>Total</span><strong>${formatInt(result.totalTokens)}</strong></div>
                </div>
            </div>`;

    if (result.priced && result.costPerRequest !== null) {
        container.innerHTML = `${tokensHtml}
            <div class="result-section">
                <h4 class="result-section-title">Cost per request</h4>
                <div class="cost-hero hero-pop">
                    <span>Estimated cost / request</span>
                    <strong>${formatCost(result.costPerRequest)}</strong>
                    <div class="cost-per-unit"><span>${per1K} / 1K tokens</span><span>${per1M} / 1M tokens</span></div>
                    ${result.isArchived ? `<div class="cost-note">Archived model — historical estimate, not a current recommendation.</div>` : ""}
                </div>
                <p class="cost-note">${escapeHtml(sourceNote + (result.priced ? tierNote + modeNote : ""))}</p>
            </div>
            <div class="result-section">
                <h4 class="result-section-title">Projection</h4>
                <div class="metric-tiles">
                    <div class="metric-tile total"><span>Per month</span><strong>${result.monthlyCost !== null ? formatCost(result.monthlyCost) : "-"}</strong></div>
                    <div class="metric-tile"><span>Per year</span><strong>${result.annualCost !== null ? formatCost(result.annualCost) : "-"}</strong></div>
                </div>
                ${result.hasInfrastructure && result.infrastructureCost ? `
                <h4 class="result-section-title" style="margin-top:1rem">GPU infrastructure — ${escapeHtml(result.infrastructureCost.gpu || "GPU")}</h4>
                <div class="metric-tiles">
                    <div class="metric-tile"><span>GPU / month</span><strong>${result.infrastructureCost.monthlyInfrastructureCost !== null ? formatCost(result.infrastructureCost.monthlyInfrastructureCost) : "-"}</strong></div>
                    <div class="metric-tile"><span>GPU / year</span><strong>${result.infrastructureCost.annualInfrastructureCost !== null ? formatCost(result.infrastructureCost.annualInfrastructureCost) : "-"}</strong></div>
                    <div class="metric-tile grand"><span>Combined / month</span><strong>${result.totalMonthlyCost !== null ? formatCost(result.totalMonthlyCost) : "-"}</strong></div>
                </div>
                <p class="cost-note">IndiaAI on-demand · ${result.infrastructureCost.runtimeHours ?? "-"} hrs/day${result.infrastructureCost.hourlyCost !== null ? ` · ${formatCost(result.infrastructureCost.hourlyCost)}/hr` : ""}. Combined = API + GPU.</p>
                ` : ""}
            </div>`;
    } else {
        container.innerHTML = `${tokensHtml}
            <div class="cost-hero hero-pop"><span>Cost unavailable</span>
                <p class="cost-note">${escapeHtml(result.pricingNote || "Pricing unavailable for this model.")}</p>
            </div>`;
    }
}

/* ================= CALCULATION PIPELINE ================= */

async function runCalculation(button) {
    button?.setAttribute("aria-busy", "true");
    if (button) button.disabled = true;
    try {
        let payload = effectivePayload();
        let bundle = await calculateAll(payload);
        if (!backendStaleFiles && isStaleFilesResponse(payload.files, bundle.result)) {
            backendStaleFiles = true;
            notifyStaleBackend();
            bundle = await calculateAll(legacyAggregatePayload());
        }
        setEstimate({
            result: bundle.result,
            comparisonRows: bundle.comparisonRows,
            archivedRows: bundle.archivedRows,
            comparisonSummary: bundle.comparisonSummary,
            recommendation: bundle.recommendation,
            scenarios: bundle.scenarios,
            inputs: draft ? { serviceCategory: draft.serviceCategory, modelId: draft.modelId, gpuConfig: draft.gpuConfig || null } : null
        });
        hasCalculated = true;
        clearStale();
        logActivity({
            type: "calculation",
            title: "Cost calculation",
            detail: `${bundle.result.modelName} · ${formatInt(bundle.result.totalTokens)} tokens`,
            status: "Calculated"
        });
        logTrendPoint({
            monthlyCost: bundle.result.monthlyCost,
            totalTokens: bundle.result.totalTokens,
            modelName: bundle.result.modelName
        });
        step = 3;
        rerender();
        showToast("Cost calculation updated.", "success");
    } catch (error) {
        console.error("Calculation failed", error);
        showToast(error?.message || "Calculation failed. Check inputs and try again.", "error");
    } finally {
        button?.removeAttribute("aria-busy");
        if (button) button.disabled = false;
    }
}

function rerender() {
    const outlet = document.getElementById("view");
    if (!outlet) return;
    const scroll = window.scrollY;
    outlet.innerHTML = render();
    mount(outlet);
    window.scrollTo(0, scroll);
}

function flagStale() {
    if (hasCalculated) {
        markStale();
        const notice = $id("staleNotice");
        if (notice) notice.hidden = false;
    }
}

export function mount() {
    if (step === 1) {
        $id("calcForm")?.addEventListener("submit", (event) => {
            event.preventDefault();
            if (continuing) return;
            if (!validateRequired()) return;
            /* Await every in-flight file parse before snapshotting inputs:
               otherwise files uploaded moments ago would be silently
               dropped from the payload and Token Analysis would show
               FILE TOKENS = 0 despite parsed content existing. */
            continuing = true;
            const btn = event.submitter || $id("calcForm")?.querySelector?.('button[type="submit"]');
            btn?.setAttribute?.("aria-busy", "true");
            if (btn) btn.disabled = true;
            Promise.allSettled(Array.from(pendingParses)).finally(() => {
                continuing = false;
                btn?.removeAttribute?.("aria-busy");
                if (btn) btn.disabled = false;
                draft = readInputs();
                draftScenario = $id("calcScenario")?.value || "current";
                step = 2;
                rerender();
            });
        });
        $id("calcCategory")?.addEventListener("change", () => {
            const el = $id("calcCategory");
            setFieldError(el, !el.value);
            if (el.value && $id("calcModel")?.value) hideFormBanner();
            flagStale();
        });
        mountModelSelect({
            selectedId: draft?.modelId || "",
            onSelect: () => {
                setFieldError($id("calcModelBtn"), false);
                if ($id("calcCategory")?.value) hideFormBanner();
                flagStale();
            }
        });
        mountGpuSelect({
            selectedId: draft?.gpuConfig?.gpuInstanceId || "",
            onSelect: () => flagStale()
        });
        $id("calcPrompt")?.addEventListener("input", () => {
            const counter = $id("promptCounter");
            if (counter) counter.textContent = `${$id("calcPrompt").value.length} characters`;
            flagStale();
        });
        [$id("calcOutput"), $id("calcRequests")].forEach((el) => el?.addEventListener("input", flagStale));
        $id("calcCached")?.addEventListener("change", flagStale);
        $id("calcScenario")?.addEventListener("change", () => {
            const scenarios = configScenarios();
            const scenario = scenarios[$id("calcScenario").value];
            if (scenario?.monthlyRequests) $id("calcRequests").value = scenario.monthlyRequests;
            flagStale();
        });
        $id("fileUpload")?.addEventListener("change", () => {
            handleFilesSelect($id("fileUpload")?.files);
            flagStale();
        });
        renderFileList();
        const promptEl = $id("calcPrompt");
        if (promptEl && promptEl.value) {
            const counter = $id("promptCounter");
            if (counter) counter.textContent = `${promptEl.value.length} characters`;
        }
        $id("gpuHoursMain")?.addEventListener("input", flagStale);
        const uploadZone = $id("uploadZone");
        if (uploadZone && $id("fileUpload")) {
            uploadZone.addEventListener("click", () => $id("fileUpload").click());
            uploadZone.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    $id("fileUpload").click();
                }
            });
            ["dragenter", "dragover"].forEach((evt) => uploadZone.addEventListener(evt, (event) => {
                event.preventDefault();
                uploadZone.classList.add("drag-over");
            }));
            ["dragleave", "drop"].forEach((evt) => uploadZone.addEventListener(evt, (event) => {
                event.preventDefault();
                uploadZone.classList.remove("drag-over");
            }));
            uploadZone.addEventListener("drop", (event) => {
                const files = event.dataTransfer?.files;
                if (files && files.length > 0) {
                    handleFilesSelect(files);
                    flagStale();
                }
            });
        }
    } else if (step === 2) {
        renderTokenAnalysis();
        $id("backToInput")?.addEventListener("click", () => { step = 1; rerender(); });
        $id("runCalc")?.addEventListener("click", (event) => runCalculation(event.currentTarget));
    } else {
        renderCostResult();
        $id("backToTokens")?.addEventListener("click", () => { step = 2; rerender(); });
        $id("genReport")?.addEventListener("click", () => {
            const built = createReportSnapshot({ fileData: getFileEntriesForReport() });
            if (!built.ok) {
                showToast(built.errors[0] || "Report needs a completed calculation first.", "error");
                return;
            }
            setReport(built.snapshot);
            logActivity({
                type: "report",
                title: "Cost report",
                detail: `${built.snapshot.report.id} · ${built.snapshot.context.selectedModel}`,
                status: "Generated"
            });
            window.location.hash = "#/report";
        });
    }
}
