/* =========================================================
   Server-side validation. Single home for input coercion so
   services never duplicate checks. Mirrors the frontend's
   former readIntInput/validateTokenCount semantics:
   invalid numerics fall back to documented defaults.
   ========================================================= */

import { resolveRate } from "../data/pricing.js";
import { GPU_PRICING_TIERS, GPU_DEFAULT_TIER } from "../services/gpuService.js";

export const DEFAULT_OUTPUT_TOKENS = 500;
export const DEFAULT_MONTHLY_REQUESTS = 1000;

export function toInt(value, fallback) {
    if (value === undefined || value === null || String(value).trim() === "") return fallback;
    const n = Number(value);
    if (!Number.isInteger(n) || !Number.isFinite(n) || n < 0) return fallback;
    return n;
}

export function validateTokenCount(value, label) {
    if (value === null || value === undefined) {
        return { ok: false, error: `${label}: missing token count.` };
    }
    const n = Number(value);
    if (Number.isNaN(n)) return { ok: false, error: `${label}: not a number.` };
    if (!Number.isFinite(n)) return { ok: false, error: `${label}: must be finite (got ${String(value)}).` };
    if (!Number.isInteger(n)) return { ok: false, error: `${label}: must be a whole number.` };
    if (n < 0) return { ok: false, error: `${label}: must not be negative.` };
    return { ok: true, value: n };
}

export function validateRate(rawRate, envRate) {
    const rate = resolveRate(rawRate, envRate);
    if (rate === null) {
        return { ok: false, error: "exchangeRate must be a positive finite number." };
    }
    return { ok: true, rate };
}

export function validatePricingMode(mode) {
    if (!mode) return { ok: true, value: "standard" };
    if (mode === "standard" || mode === "batch") return { ok: true, value: mode };
    return { ok: false, error: `Unsupported pricing mode "${mode}". Supported: standard, batch.` };
}

/* Shared request preamble for the workload routes (calculate/compare/
   reports): workload coercion → rate resolution → pricing-mode check.
   Returns { ok:true, inputs, rate } or { ok:false, error } for 400s. */
export function validateWorkloadRequest(body = {}, envRate) {
    const checked = validateWorkload(body);
    if (!checked.ok) return checked;
    const rateCheck = validateRate(body.exchangeRate, envRate);
    if (!rateCheck.ok) return rateCheck;
    const modeCheck = validatePricingMode(checked.inputs.pricingMode);
    if (!modeCheck.ok) return modeCheck;
    return { ok: true, inputs: checked.inputs, rate: rateCheck.rate };
}

/* Workload inputs shared by calculate/compare/reports.
   Returns { ok, inputs } or { ok:false, error } for 400s. */
export function validateWorkload(body = {}) {
    const outputTokens = toInt(body.outputTokens, DEFAULT_OUTPUT_TOKENS);
    const monthlyRequests = toInt(body.monthlyRequests, DEFAULT_MONTHLY_REQUESTS);

    let gpuConfig = null;
    if (body.gpuConfig !== undefined && body.gpuConfig !== null) {
        const g = body.gpuConfig;
        const hourlyCost = g.hourlyCost === undefined || g.hourlyCost === null || g.hourlyCost === ""
            ? null : Number(g.hourlyCost);
        if (hourlyCost !== null && (!Number.isFinite(hourlyCost) || hourlyCost < 0)) {
            return { ok: false, error: "gpuConfig.hourlyCost must be a non-negative number." };
        }
        const runtimeHours = g.runtimeHours === undefined || g.runtimeHours === null || g.runtimeHours === ""
            ? 24 : Number(g.runtimeHours);
        if (!Number.isFinite(runtimeHours) || runtimeHours < 0) {
            return { ok: false, error: "gpuConfig.runtimeHours must be a non-negative number." };
        }
        const gpuInstanceId = g.gpuInstanceId === undefined || g.gpuInstanceId === null || g.gpuInstanceId === ""
            ? null : String(g.gpuInstanceId);
        const rawTier = g.gpuPricingTier === undefined || g.gpuPricingTier === null || g.gpuPricingTier === ""
            ? GPU_DEFAULT_TIER : String(g.gpuPricingTier);
        if (!GPU_PRICING_TIERS.includes(rawTier)) {
            return { ok: false, error: `gpuConfig.gpuPricingTier must be one of ${GPU_PRICING_TIERS.join(", ")}.` };
        }
        gpuConfig = {
            gpuInstanceId,
            gpuPricingTier: rawTier,
            hourlyCost,
            runtimeHours
        };
        if (!gpuConfig.gpuInstanceId && gpuConfig.hourlyCost === null) gpuConfig = null;
    }

    const fileMeta = body.fileMeta ?? null;
    if (fileMeta !== null) {
        if (typeof fileMeta.name !== "string" || !fileMeta.name) {
            return { ok: false, error: "fileMeta.name must be a non-empty string." };
        }
        if (!Number.isInteger(Number(fileMeta.size)) || Number(fileMeta.size) < 0) {
            return { ok: false, error: "fileMeta.size must be a whole number ≥ 0." };
        }
    }

    /* Multi-file workloads: optional array of per-file payloads with the
       same shape as the legacy single-file fields. Validated entry by
       entry so one bad entry is rejected without ambiguity. When present
       and non-empty, token math aggregates across entries. */
    let files = null;
    if (body.files !== undefined && body.files !== null) {
        if (!Array.isArray(body.files)) {
            return { ok: false, error: "files must be an array." };
        }
        if (body.files.length > 20) {
            return { ok: false, error: "Too many files (max 20 per calculation)." };
        }
        files = [];
        for (let i = 0; i < body.files.length; i++) {
            const f = body.files[i] ?? {};
            const fileText = typeof f.fileText === "string" ? f.fileText : null;
            const fileRef = typeof f.fileRef === "string" && f.fileRef ? f.fileRef : null;
            let entryMeta = f.fileMeta ?? null;
            if (entryMeta !== null) {
                if (typeof entryMeta.name !== "string" || !entryMeta.name) {
                    return { ok: false, error: `files[${i}].fileMeta.name must be a non-empty string.` };
                }
                if (!Number.isInteger(Number(entryMeta.size)) || Number(entryMeta.size) < 0) {
                    return { ok: false, error: `files[${i}].fileMeta.size must be a whole number ≥ 0.` };
                }
                entryMeta = { name: entryMeta.name, size: Number(entryMeta.size) };
            }
            const entryParseMeta = f.parseMeta && typeof f.parseMeta === "object" ? f.parseMeta : null;
            files.push({ fileText, fileRef, fileMeta: entryMeta, parseMeta: entryParseMeta });
        }
    }

    return {
        ok: true,
        inputs: {
            serviceCategory: typeof body.serviceCategory === "string" ? body.serviceCategory : "",
            modelId: typeof body.modelId === "string" ? body.modelId : "",
            prompt: typeof body.prompt === "string" ? body.prompt : "",
            fileText: typeof body.fileText === "string" ? body.fileText : null,
            fileMeta,
            parseMeta: body.parseMeta && typeof body.parseMeta === "object" ? body.parseMeta : null,
            files,
            outputTokens,
            monthlyRequests,
            useCachedInput: body.useCachedInput === true,
            pricingMode: body.pricingMode || "standard",
            gpuConfig
        }
    };
}
