/* =========================================================
   API communication boundary. All backend traffic goes
   through here — features never call fetch() directly.
   Same-origin by default (backend serves this frontend).
   Caches UI metadata (config/models) after boot init.
   ========================================================= */

import { setBackendRate } from "../app/prefs.js";

let cachedConfig = null;
let cachedModels = null;
let cachedGpus = null;

class ApiError extends Error {
    constructor(status, message, body) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.body = body;
    }
}

/* Every backend call is time-boxed: without this a stalled server
   (or a dropped connection that never errors) leaves uploads and
   calculations hanging forever with no recovery path. */
const REQUEST_TIMEOUT_MS = 60000;

async function request(path, { method = "GET", json = null, form = null, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    let response;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timer = null;
    try {
        const options = {
            method,
            ...(json !== null ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(json)
            } : {}),
            ...(form !== null ? { body: form } : {}),
            ...(controller ? { signal: controller.signal } : {})
        };
        if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
        response = await fetch(path, options);
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new ApiError(0, "Backend timed out. Check the server or try a smaller file.", null);
        }
        throw new ApiError(0, "Backend unreachable. Start it with: node backend/server.js", null);
    } finally {
        if (timer !== null) clearTimeout(timer);
    }
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok) {
        throw new ApiError(response.status, body?.error || `Request failed (${response.status}).`, body);
    }
    return body;
}

/* ---- metadata (cached) ---- */

export async function initApi() {
    const [config, models, gpus] = await Promise.all([
        request("/api/config"),
        request("/api/models"),
        request("/api/gpus").catch(() => null)
    ]);
    cachedConfig = config;
    cachedModels = models;
    cachedGpus = gpus;
    if (Number.isFinite(Number(config?.usdToInr)) && Number(config.usdToInr) > 0) {
        setBackendRate(Number(config.usdToInr));
    }
    return { config, models, gpus };
}

export function getCachedConfig() {
    return cachedConfig;
}

export function getCachedModels() {
    return cachedModels;
}

export function getCachedGpus() {
    return cachedGpus;
}

/* ---- endpoints ---- */

export const fetchEstimate = (payload) => request("/api/calculate", { method: "POST", json: payload });
export const fetchComparison = (payload) => request("/api/compare", { method: "POST", json: payload });
export const fetchReport = (payload) => request("/api/reports", { method: "POST", json: payload });
export const parseFileJson = (payload) => request("/api/files/parse", { method: "POST", json: payload });
export const parseFileUpload = (form, modelId) => {
    if (modelId) form.append("modelId", modelId);
    return request("/api/files/parse", { method: "POST", form });
};
