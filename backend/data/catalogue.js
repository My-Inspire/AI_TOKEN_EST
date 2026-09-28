/* =========================================================
   AI COST MONITOR — V3
   data.js — centralized model catalogue + reference data.

   Architecture: Provider → Model (Active / Archived)
   Pricing stored as USD per 1M tokens (human-readable).
   Internal engine converts to per-token for calculations.

   Rules enforced here:
   - Only 7 supported providers (+ "custom" for private/GPU
     modelling, preserved from V1 — NOT an AI provider).
   - NO Meta/Llama, NO NVIDIA/Nemotron, NO third category
     ("excluded"/"unsupported"/"removed" do not exist).
   - Unknown pricing is null + pricingStatus "unverified",
     NEVER 0. Missing values stay null — never fabricated.
   - Every verified model carries source{} with official URLs
     and verification date. Official docs are the authority.
   ========================================================= */

/* Re-verified 2026-09-14 against all 7 providers' official pricing docs:
   OpenAI / Google / Anthropic / xAI / Moonshot match; DeepSeek moved to a
   peak/off-peak list (numbers + notes updated below); GPT-5 Mini gained its
   published cached-input rate. USD→INR reference (94.50) unchanged — market
   94.5–95.4, still representative. */
const DATA_VERIFIED_AT = "2026-09-14";
const PRICING_UNIT = "PER_1M_TOKENS";
const PRICING_CURRENCY = "USD";


/* ================= PROVIDERS =================
   The 7 supported AI providers for this version.
   "custom" is preserved ONLY for private/self-hosted GPU
   modelling (existing V1 feature) — it is not an AI vendor
   and carries no catalogue models with API pricing. */

const PROVIDERS = {

    openai: {
        id: "openai",
        name: "OpenAI",
        type: "cloud",
        pricingUrl: "https://developers.openai.com/api/docs/pricing",
        modelUrl: "https://developers.openai.com/api/docs/models"
    },

    google: {
        id: "google",
        name: "Google Gemini",
        type: "cloud",
        pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing",
        modelUrl: "https://ai.google.dev/gemini-api/docs/models"
    },

    anthropic: {
        id: "anthropic",
        name: "Anthropic Claude",
        type: "cloud",
        pricingUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
        modelUrl: "https://platform.claude.com/docs/en/about-claude/models"
    },

    deepseek: {
        id: "deepseek",
        name: "DeepSeek",
        type: "cloud",
        pricingUrl: "https://api-docs.deepseek.com/quick_start/pricing/",
        modelUrl: "https://api-docs.deepseek.com/"
    },

    mistral: {
        id: "mistral",
        name: "Mistral AI",
        type: "cloud",
        pricingUrl: "https://docs.mistral.ai/inference/pricing",
        modelUrl: "https://docs.mistral.ai/getting-started/models"
    },

    xai: {
        id: "xai",
        name: "xAI",
        type: "cloud",
        pricingUrl: "https://docs.x.ai/developers/pricing",
        modelUrl: "https://docs.x.ai/developers/models"
    },

    moonshot: {
        id: "moonshot",
        name: "Kimi / Moonshot",
        type: "cloud",
        pricingUrl: "https://platform.kimi.ai/docs/pricing/chat",
        modelUrl: "https://platform.kimi.ai/docs"
    },

    custom: {
        id: "custom",
        name: "Custom / Private",
        type: "private",
        pricingUrl: null,
        modelUrl: null
    }

};


/* ================= MODEL CATALOGUE =================
   status: "active" | "archived" — ONLY these two values.
   pricingStatus: "verified" | "unverified".
   Unverified pricing uses null rates (never 0).

   pricing tiers:
   - shortContext / longContext (selected by engine from
     longContextThreshold + actual input tokens)
   - batch (kept SEPARATE from standard — never overwrites it). */

function src(provider, pricingUrl, modelUrl, verifiedAt, method) {
    return {
        provider,
        pricingUrl: pricingUrl || PROVIDERS[provider]?.pricingUrl || null,
        modelUrl: modelUrl || PROVIDERS[provider]?.modelUrl || null,
        verifiedAt: verifiedAt || DATA_VERIFIED_AT,
        verificationMethod: method || "official-documentation"
    };
}

function px(input, output, extra) {
    return {
        currency: PRICING_CURRENCY,
        unit: PRICING_UNIT,
        input: input ?? null,
        output: output ?? null,
        cachedInput: null,
        cacheWrite: null,
        batch: null,
        tiers: null,
        longContextThreshold: null,
        specialPricing: null,
        ...(extra || {})
    };
}

const OPENAI_PRICING_DOC = "https://developers.openai.com/api/docs/pricing";

const MODEL_FAMILIES = {

    /* ================= OPENAI — ACTIVE (19) ================= */

    "gpt-5.6-sol": {
        id: "gpt-5.6-sol", apiId: "gpt-5.6-sol", provider: "openai",
        name: "GPT-5.6 Sol", family: "GPT-5.6",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(2.00, 10.00, {
            cachedInput: 0.20, cacheWrite: 2.50,
            tiers: {
                shortContext: { input: 2.00, output: 10.00, cachedInput: 0.20, cacheWrite: 2.50 },
                longContext: { input: 4.00, output: 15.00, cachedInput: 0.40, cacheWrite: 5.00 }
            },
            batch: { input: 1.00, output: 5.00, note: "Batch API at 50% of standard rate." },
            specialPricing: "Short/long context tiers; cached input 10% of input; cache writes billed separately; regional +10% uplift where eligible. Promotional list pricing applies at least through 2026-11-21."
        }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models/gpt-5.6")
    },

    "gpt-5.6-terra": {
        id: "gpt-5.6-terra", apiId: "gpt-5.6-terra", provider: "openai",
        name: "GPT-5.6 Terra", family: "GPT-5.6",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(1.00, 6.00, {
            cachedInput: 0.10, cacheWrite: 1.25,
            tiers: {
                shortContext: { input: 1.00, output: 6.00, cachedInput: 0.10, cacheWrite: 1.25 },
                longContext: { input: 2.00, output: 9.00, cachedInput: 0.20, cacheWrite: 2.50 }
            },
            batch: { input: 0.50, output: 3.00, note: "Batch API at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models/gpt-5.6")
    },

    "gpt-5.6-luna": {
        id: "gpt-5.6-luna", apiId: "gpt-5.6-luna", provider: "openai",
        name: "GPT-5.6 Luna", family: "GPT-5.6",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.10, 0.60, {
            cachedInput: 0.01, cacheWrite: 0.125,
            tiers: {
                shortContext: { input: 0.10, output: 0.60, cachedInput: 0.01, cacheWrite: 0.125 },
                longContext: { input: 0.20, output: 0.90, cachedInput: 0.02, cacheWrite: 0.25 }
            },
            batch: { input: 0.05, output: 0.30, note: "Batch API at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models/gpt-5.6")
    },

    "gpt-5.5": {
        id: "gpt-5.5", apiId: "gpt-5.5", provider: "openai",
        name: "GPT-5.5", family: "GPT-5.5",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(5.00, 30.00, {
            batch: { input: 2.50, output: 15.00, note: "Batch/Flex at 50% of standard rate per launch announcement." },
            specialPricing: "Priority processing at 2.5x standard rate."
        }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://openai.com/index/introducing-gpt-5-5/")
    },

    "gpt-5.5-pro": {
        id: "gpt-5.5-pro", apiId: "gpt-5.5-pro", provider: "openai",
        name: "GPT-5.5 Pro", family: "GPT-5.5",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(30.00, 180.00, {
            batch: { input: 15.00, output: 90.00, note: "Batch/Flex at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://openai.com/index/introducing-gpt-5-5/")
    },

    "gpt-5.4": {
        id: "gpt-5.4", apiId: "gpt-5.4", provider: "openai",
        name: "GPT-5.4", family: "GPT-5.4",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1050000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(2.50, 15.00, {
            cachedInput: 0.25,
            tiers: {
                shortContext: { input: 2.50, output: 15.00, cachedInput: 0.25 },
                longContext: { input: 5.00, output: 22.50, cachedInput: 0.50 }
            },
            longContextThreshold: 272000,
            batch: { input: 1.25, output: 7.50, note: "Batch API at 50% of standard rate." },
            specialPricing: "Prompts with >272K input tokens priced at 2x input and 1.5x output for the full session."
        }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models/gpt-5.4")
    },

    "gpt-5.4-pro": {
        id: "gpt-5.4-pro", apiId: "gpt-5.4-pro", provider: "openai",
        name: "GPT-5.4 Pro", family: "GPT-5.4",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1050000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(30.00, 180.00, {
            longContextThreshold: 272000,
            tiers: {
                shortContext: { input: 30.00, output: 180.00 },
                longContext: { input: 60.00, output: 270.00 }
            },
            batch: { input: 15.00, output: 90.00, note: "Batch API at 50% of standard rate." },
            specialPricing: "Prompts with >272K input tokens priced at 2x input and 1.5x output for the full session."
        }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models/gpt-5.4")
    },

    "gpt-5.4-mini": {
        id: "gpt-5.4-mini", apiId: "gpt-5.4-mini", provider: "openai",
        name: "GPT-5.4 Mini", family: "GPT-5.4",
        type: "chat", status: "active", availability: "online",
        contextWindow: 400000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.75, 4.50, {
            batch: { input: 0.375, output: 2.25, note: "Batch API at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models/gpt-5.4")
    },

    "gpt-5.4-nano": {
        id: "gpt-5.4-nano", apiId: "gpt-5.4-nano", provider: "openai",
        name: "GPT-5.4 Nano", family: "GPT-5.4",
        type: "chat", status: "active", availability: "online",
        contextWindow: 400000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.20, 1.25, {
            batch: { input: 0.10, output: 0.625, note: "Batch API at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models/gpt-5.4")
    },

    "gpt-5.3-codex": {
        id: "gpt-5.3-codex", apiId: "gpt-5.3-codex", provider: "openai",
        name: "GPT-5.3 Codex", family: "GPT-5.3",
        type: "chat", status: "active", availability: "online",
        contextWindow: 400000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(null, null),
        pricingStatus: "unverified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", null, "official-documentation-pending")
    },

    "gpt-5.2": {
        id: "gpt-5.2", apiId: "gpt-5.2", provider: "openai",
        name: "GPT-5.2", family: "GPT-5.2",
        type: "chat", status: "active", availability: "online",
        contextWindow: 400000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(1.75, 14.00, {
            batch: { input: 0.875, output: 7.00, note: "Batch API at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models/gpt-5")
    },

    "gpt-5.2-pro": {
        id: "gpt-5.2-pro", apiId: "gpt-5.2-pro", provider: "openai",
        name: "GPT-5.2 Pro", family: "GPT-5.2",
        type: "chat", status: "active", availability: "online",
        contextWindow: 400000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(null, null),
        pricingStatus: "unverified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", null, "official-documentation-pending")
    },

    "gpt-5.1": {
        id: "gpt-5.1", apiId: "gpt-5.1", provider: "openai",
        name: "GPT-5.1", family: "GPT-5.1",
        type: "chat", status: "active", availability: "online",
        contextWindow: 400000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(null, null),
        pricingStatus: "unverified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", null, "official-documentation-pending")
    },

    "gpt-5": {
        id: "gpt-5", apiId: "gpt-5", provider: "openai",
        name: "GPT-5", family: "GPT-5",
        type: "chat", status: "active", availability: "online",
        contextWindow: 400000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(1.25, 10.00, {
            cachedInput: 0.125,
            batch: { input: 0.625, output: 5.00, note: "Batch API at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models/gpt-5")
    },

    "gpt-5-mini": {
        id: "gpt-5-mini", apiId: "gpt-5-mini", provider: "openai",
        name: "GPT-5 Mini", family: "GPT-5",
        type: "chat", status: "active", availability: "online",
        contextWindow: 400000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.25, 2.00, {
            cachedInput: 0.025,
            batch: { input: 0.125, output: 1.00, note: "Batch API at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models/gpt-5")
    },

    "gpt-5-nano": {
        id: "gpt-5-nano", apiId: "gpt-5-nano", provider: "openai",
        name: "GPT-5 Nano", family: "GPT-5",
        type: "chat", status: "active", availability: "online",
        contextWindow: 400000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(null, null),
        pricingStatus: "unverified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", null, "official-documentation-pending")
    },

    "gpt-5-pro": {
        id: "gpt-5-pro", apiId: "gpt-5-pro", provider: "openai",
        name: "GPT-5 Pro", family: "GPT-5",
        type: "chat", status: "active", availability: "online",
        contextWindow: 400000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(null, null),
        pricingStatus: "unverified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", null, "official-documentation-pending")
    },

    "gpt-4.1": {
        id: "gpt-4.1", apiId: "gpt-4.1", provider: "openai",
        name: "GPT-4.1", family: "GPT-4.1",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 32768, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(2.00, 8.00, {
            cachedInput: 0.50,
            batch: { input: 1.00, output: 4.00, note: "Batch API price per model card." }
        }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models/gpt-4.1")
    },

    "gpt-4.1-mini": {
        id: "gpt-4.1-mini", apiId: "gpt-4.1-mini", provider: "openai",
        name: "GPT-4.1 Mini", family: "GPT-4.1",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 32768, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(null, null),
        pricingStatus: "unverified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models/gpt-4.1", null, "official-documentation-pending")
    },

    /* ================= GOOGLE GEMINI — ACTIVE (9) ================= */

    "gemini-3.7-flash": {
        id: "gemini-3.7-flash", apiId: "gemini-3.7-flash", provider: "google",
        name: "Gemini 3.7 Flash", family: "Gemini 3.7",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 65536, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.75, 3.75, {
            cachedInput: 0.075,
            batch: { input: 0.375, output: 1.875, note: "Batch at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("google", "https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/docs/models")
    },

    "gemini-3.6-flash": {
        id: "gemini-3.6-flash", apiId: "gemini-3.6-flash", provider: "google",
        name: "Gemini 3.6 Flash", family: "Gemini 3.6",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 65536, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(1.50, 7.50, {
            cachedInput: 0.15,
            batch: { input: 0.75, output: 3.75, note: "Batch at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("google", "https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/docs/models")
    },

    "gemini-3.5-flash": {
        id: "gemini-3.5-flash", apiId: "gemini-3.5-flash", provider: "google",
        name: "Gemini 3.5 Flash", family: "Gemini 3.5",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 65536, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(1.50, 9.00, {
            cachedInput: 0.15,
            batch: { input: 0.75, output: 4.50, note: "Batch at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("google", "https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/docs/models")
    },

    "gemini-3.5-flash-lite": {
        id: "gemini-3.5-flash-lite", apiId: "gemini-3.5-flash-lite", provider: "google",
        name: "Gemini 3.5 Flash-Lite", family: "Gemini 3.5",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 65536, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.30, 2.50, {
            cachedInput: 0.03,
            batch: { input: 0.15, output: 1.25, note: "Batch at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("google", "https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/docs/models")
    },

    "gemini-3.1-flash-lite": {
        id: "gemini-3.1-flash-lite", apiId: "gemini-3.1-flash-lite", provider: "google",
        name: "Gemini 3.1 Flash-Lite", family: "Gemini 3.1",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 65536, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.25, 1.50, {
            cachedInput: 0.025,
            batch: { input: 0.125, output: 0.75, note: "Batch at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("google", "https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/docs/models")
    },

    "gemini-3.1-pro": {
        id: "gemini-3.1-pro", apiId: "gemini-3.1-pro-preview", provider: "google",
        name: "Gemini 3.1 Pro", family: "Gemini 3.1",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 65536, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(2.00, 12.00, {
            cachedInput: 0.20,
            tiers: {
                shortContext: { input: 2.00, output: 12.00, cachedInput: 0.20 },
                longContext: { input: 4.00, output: 18.00, cachedInput: 0.40 }
            },
            longContextThreshold: 200000,
            batch: { input: 1.00, output: 6.00, note: "Batch at 50% of standard rate." },
            specialPricing: "Prompts above 200K tokens billed at the higher rate for the full request."
        }),
        pricingStatus: "verified",
        source: src("google", "https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/docs/models")
    },

    "gemini-2.5-pro": {
        id: "gemini-2.5-pro", apiId: "gemini-2.5-pro", provider: "google",
        name: "Gemini 2.5 Pro", family: "Gemini 2.5",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 65536, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(1.25, 10.00, {
            cachedInput: 0.125,
            tiers: {
                shortContext: { input: 1.25, output: 10.00, cachedInput: 0.125 },
                longContext: { input: 2.50, output: 15.00, cachedInput: 0.25 }
            },
            longContextThreshold: 200000,
            batch: { input: 0.625, output: 5.00, note: "Batch at 50% of standard rate." },
            specialPricing: "Prompts above 200K tokens billed at the higher rate for the full request."
        }),
        pricingStatus: "verified",
        source: src("google", "https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/docs/models")
    },

    "gemini-2.5-flash": {
        id: "gemini-2.5-flash", apiId: "gemini-2.5-flash", provider: "google",
        name: "Gemini 2.5 Flash", family: "Gemini 2.5",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 65536, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.30, 2.50, {
            cachedInput: 0.03,
            batch: { input: 0.15, output: 1.25, note: "Batch at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("google", "https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/docs/models")
    },

    "gemini-2.5-flash-lite": {
        id: "gemini-2.5-flash-lite", apiId: "gemini-2.5-flash-lite", provider: "google",
        name: "Gemini 2.5 Flash-Lite", family: "Gemini 2.5",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 65536, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.10, 0.40, {
            cachedInput: 0.01,
            batch: { input: 0.05, output: 0.20, note: "Batch at 50% of standard rate." }
        }),
        pricingStatus: "verified",
        source: src("google", "https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/docs/models")
    },

    /* ================= ANTHROPIC CLAUDE — ACTIVE (5) ================= */

    "claude-opus-5-5": {
        id: "claude-opus-5-5", apiId: "claude-opus-5-5", provider: "anthropic",
        name: "Claude Opus 5.5", family: "Claude Opus",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 128000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(4.00, 20.00, {
            cachedInput: 0.20,
            cacheWrite: 5.00,
            batch: { input: 2.00, output: 10.00, note: "Batch rate per official pricing table (50% of standard)." },
            specialPricing: "5-min cache writes $5/M; 1-hr cache writes $8/M; cache hits & refreshes $0.20/M (0.05x base). 1M context at standard pricing. Fast mode $8/$40 API-only."
        }),
        pricingStatus: "verified",
        source: src("anthropic", "https://platform.claude.com/docs/en/about-claude/pricing", "https://platform.claude.com/docs/en/models/opus-5-5/overview", "2026-09-25")
    },

    "claude-fable-5-1": {
        id: "claude-fable-5-1", apiId: "claude-fable-5-1", provider: "anthropic",
        name: "Claude Fable 5.1", family: "Claude Fable",
        type: "chat", status: "active", availability: "online",
        contextWindow: 200000, maxOutputTokens: 64000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(10.00, 50.00, {
            cachedInput: 0.25,
            cacheWrite: 12.50,
            batch: { input: 5.00, output: 25.00, note: "Batch rate per official pricing table." },
            specialPricing: "5-min cache writes $12.50/M; 1-hr cache writes $20/M; cache hits & refreshes $0.25/M."
        }),
        pricingStatus: "verified",
        source: src("anthropic", "https://platform.claude.com/docs/en/about-claude/pricing", "https://platform.claude.com/docs/en/about-claude/models")
    },

    "claude-opus-5": {
        id: "claude-opus-5", apiId: "claude-opus-5", provider: "anthropic",
        name: "Claude Opus 5", family: "Claude Opus",
        type: "chat", status: "active", availability: "online",
        contextWindow: 200000, maxOutputTokens: 64000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(5.00, 25.00, {
            cachedInput: 0.50,
            cacheWrite: 6.25,
            batch: { input: 2.50, output: 12.50, note: "Batch rate per official pricing table." },
            specialPricing: "5-min cache writes $6.25/M; 1-hr cache writes $10/M; cache hits & refreshes $0.50/M."
        }),
        pricingStatus: "verified",
        source: src("anthropic", "https://platform.claude.com/docs/en/about-claude/pricing", "https://platform.claude.com/docs/en/about-claude/models")
    },

    "claude-sonnet-5": {
        id: "claude-sonnet-5", apiId: "claude-sonnet-5", provider: "anthropic",
        name: "Claude Sonnet 5", family: "Claude Sonnet",
        type: "chat", status: "active", availability: "online",
        contextWindow: 200000, maxOutputTokens: 64000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(2.00, 10.00, {
            cachedInput: 0.20,
            cacheWrite: 2.50,
            batch: { input: 1.00, output: 5.00, note: "Batch rate per official pricing table." },
            specialPricing: "5-min cache writes $2.50/M; 1-hr cache writes $4/M; cache hits & refreshes $0.20/M. $2/$10 confirmed as standard price (Sep 2026 increase cancelled)."
        }),
        pricingStatus: "verified",
        source: src("anthropic", "https://platform.claude.com/docs/en/about-claude/pricing", "https://platform.claude.com/docs/en/about-claude/models")
    },

    "claude-haiku-4-5": {
        id: "claude-haiku-4-5", apiId: "claude-haiku-4-5", provider: "anthropic",
        name: "Claude Haiku 4.5", family: "Claude Haiku",
        type: "chat", status: "active", availability: "online",
        contextWindow: 200000, maxOutputTokens: 64000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(1.00, 5.00, {
            cachedInput: 0.10,
            cacheWrite: 1.25,
            batch: { input: 0.50, output: 2.50, note: "Batch rate per official pricing table." },
            specialPricing: "5-min cache writes $1.25/M; 1-hr cache writes $2/M; cache hits & refreshes $0.10/M."
        }),
        pricingStatus: "verified",
        source: src("anthropic", "https://platform.claude.com/docs/en/about-claude/pricing", "https://platform.claude.com/docs/en/about-claude/models")
    },

    /* ================= DEEPSEEK — ACTIVE (3) ================= */

    "deepseek-v4-flash": {
        id: "deepseek-v4-flash", apiId: "deepseek-v4-flash", provider: "deepseek",
        name: "DeepSeek V4 Flash", family: "DeepSeek V4",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 384000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: false },
        pricing: px(0.30, 1.20, {
            cachedInput: 0.006,
            specialPricing: "Peak-hour list rate (Sep 2026 price list). Off-peak is exactly 50% (input $0.15, output $0.60, cache-hit $0.003); peak hours 01:00-04:00 & 06:00-10:00 UTC Mon-Fri. Served by DeepSeek-V4.1-Flash; legacy v4-flash names retired but still accepted. Supports thinking + non-thinking modes at the same rate."
        }),
        pricingStatus: "verified",
        source: src("deepseek", "https://api-docs.deepseek.com/quick_start/pricing/", "https://api-docs.deepseek.com/")
    },

    "deepseek-v4-pro": {
        id: "deepseek-v4-pro", apiId: "deepseek-v4-pro", provider: "deepseek",
        name: "DeepSeek V4 Pro", family: "DeepSeek V4",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 384000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: false },
        pricing: px(1.32, 3.96, {
            cachedInput: 0.044,
            specialPricing: "Peak-hour list rate for DeepSeek-V4-Pro-0813 (Sep 2026 price list). Off-peak is exactly 50% (input $0.66, output $1.98, cache-hit $0.022); peak hours 01:00-04:00 & 06:00-10:00 UTC Mon-Fri. V4 Pro API continues past 2026-09-14 per official notice; the May-2026 discount schedule is superseded by this peak/off-peak list."
        }),
        pricingStatus: "verified",
        source: src("deepseek", "https://api-docs.deepseek.com/quick_start/pricing/", "https://api-docs.deepseek.com/")
    },

    "deepseek-v4-flash-vision": {
        id: "deepseek-v4-flash-vision", apiId: "deepseek-v4-flash-vision", provider: "deepseek",
        name: "DeepSeek V4 Flash Vision", family: "DeepSeek V4",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: 384000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.30, 1.20, {
            cachedInput: 0.006,
            specialPricing: "Peak-hour list rate; off-peak is exactly 50%. Vision input tokens billed at the standard Flash input rate; no separate official vision-token price published. Legacy v4-flash-vision names retired but still accepted (served by V4.1-Flash)."
        }),
        pricingStatus: "verified",
        source: src("deepseek", "https://api-docs.deepseek.com/quick_start/pricing/", "https://api-docs.deepseek.com/")
    },

    /* ================= MISTRAL — ACTIVE (6) ================= */

    "mistral-large-3": {
        id: "mistral-large-3", apiId: "mistral-large-latest", provider: "mistral",
        name: "Mistral Large 3", family: "Mistral Large",
        type: "chat", status: "active", availability: "online",
        contextWindow: 256000, maxOutputTokens: 8192, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.50, 1.50, {
            cachedInput: 0.05,
            batch: { input: 0.25, output: 0.75, note: "Batch processing at 50% per Mistral pricing." }
        }),
        pricingStatus: "verified",
        source: src("mistral", "https://docs.mistral.ai/inference/pricing", "https://docs.mistral.ai/getting-started/models")
    },

    "mistral-medium-3-5": {
        id: "mistral-medium-3-5", apiId: "mistral-medium-latest", provider: "mistral",
        name: "Mistral Medium 3.5", family: "Mistral Medium",
        type: "chat", status: "active", availability: "online",
        contextWindow: 256000, maxOutputTokens: 8192, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(1.50, 7.50, {
            cachedInput: 0.15,
            batch: { input: 0.75, output: 3.75, note: "Batch processing at 50% per Mistral pricing." }
        }),
        pricingStatus: "verified",
        source: src("mistral", "https://docs.mistral.ai/inference/pricing", "https://docs.mistral.ai/getting-started/models")
    },

    "mistral-small-4": {
        id: "mistral-small-4", apiId: "mistral-small-latest", provider: "mistral",
        name: "Mistral Small 4", family: "Mistral Small",
        type: "chat", status: "active", availability: "online",
        contextWindow: 256000, maxOutputTokens: 8192, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.15, 0.60, {
            cachedInput: 0.015,
            batch: { input: 0.075, output: 0.30, note: "Batch processing at 50% per Mistral pricing." }
        }),
        pricingStatus: "verified",
        source: src("mistral", "https://docs.mistral.ai/inference/pricing", "https://docs.mistral.ai/getting-started/models")
    },

    "mistral-3-14b": {
        id: "mistral-3-14b", apiId: "mistral-14b-latest", provider: "mistral",
        name: "Mistral 3 14B", family: "Mistral 3",
        type: "chat", status: "active", availability: "online",
        contextWindow: 256000, maxOutputTokens: 8192, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: false },
        pricing: px(0.20, 0.20, {
            cachedInput: 0.02,
            batch: { input: 0.10, output: 0.10, note: "Batch processing at 50% per Mistral pricing." }
        }),
        pricingStatus: "verified",
        source: src("mistral", "https://docs.mistral.ai/inference/pricing", "https://docs.mistral.ai/getting-started/models")
    },

    "mistral-3-8b": {
        id: "mistral-3-8b", apiId: "mistral-8b-latest", provider: "mistral",
        name: "Mistral 3 8B", family: "Mistral 3",
        type: "chat", status: "active", availability: "online",
        contextWindow: 256000, maxOutputTokens: 8192, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: false },
        pricing: px(0.15, 0.15, {
            cachedInput: 0.015,
            batch: { input: 0.075, output: 0.075, note: "Batch processing at 50% per Mistral pricing." }
        }),
        pricingStatus: "verified",
        source: src("mistral", "https://docs.mistral.ai/inference/pricing", "https://docs.mistral.ai/getting-started/models")
    },

    "mistral-3-3b": {
        id: "mistral-3-3b", apiId: "mistral-3b-latest", provider: "mistral",
        name: "Mistral 3 3B", family: "Mistral 3",
        type: "chat", status: "active", availability: "online",
        contextWindow: 256000, maxOutputTokens: 8192, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: false },
        pricing: px(0.10, 0.10, {
            cachedInput: 0.01,
            batch: { input: 0.05, output: 0.05, note: "Batch processing at 50% per Mistral pricing." }
        }),
        pricingStatus: "verified",
        source: src("mistral", "https://docs.mistral.ai/inference/pricing", "https://docs.mistral.ai/getting-started/models")
    },

    /* ================= xAI — ACTIVE (5) ================= */

    "grok-4-6": {
        id: "grok-4-6", apiId: "grok-4.6", provider: "xai",
        name: "Grok 4.6", family: "Grok 4",
        type: "chat", status: "active", availability: "online",
        contextWindow: 500000, maxOutputTokens: null, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(2.00, 6.00, {
            cachedInput: 0.50,
            tiers: {
                shortContext: { input: 2.00, output: 6.00, cachedInput: 0.50 },
                longContext: { input: 4.00, output: 12.00, cachedInput: 1.00 }
            },
            longContextThreshold: 200000,
            batch: { input: 1.60, output: 4.80, note: "Batch API at 20% discount to standard rates." },
            specialPricing: "Prompts >= 200K tokens billed at the higher rate for ALL tokens in the request."
        }),
        pricingStatus: "verified",
        source: src("xai", "https://docs.x.ai/developers/pricing", "https://docs.x.ai/developers/models")
    },

    "grok-4-20": {
        id: "grok-4-20", apiId: "grok-4.20-0309-non-reasoning", provider: "xai",
        name: "Grok 4.20", family: "Grok 4",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: null, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(1.25, 2.50, {
            cachedInput: 0.20,
            tiers: {
                shortContext: { input: 1.25, output: 2.50, cachedInput: 0.20 },
                longContext: { input: 2.50, output: 5.00, cachedInput: 0.40 }
            },
            longContextThreshold: 200000,
            batch: { input: 1.00, output: 2.00, note: "Batch API at 20% discount to standard rates." },
            specialPricing: "Prompts >= 200K tokens billed at the higher rate for ALL tokens in the request."
        }),
        pricingStatus: "verified",
        source: src("xai", "https://docs.x.ai/developers/pricing", "https://docs.x.ai/developers/models")
    },

    "grok-4-20-reasoning": {
        id: "grok-4-20-reasoning", apiId: "grok-4.20-0309-reasoning", provider: "xai",
        name: "Grok 4.20 Reasoning", family: "Grok 4",
        type: "reasoning", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: null, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(1.25, 2.50, {
            cachedInput: 0.20,
            tiers: {
                shortContext: { input: 1.25, output: 2.50, cachedInput: 0.20 },
                longContext: { input: 2.50, output: 5.00, cachedInput: 0.40 }
            },
            longContextThreshold: 200000,
            batch: { input: 1.00, output: 2.00, note: "Batch API at 20% discount to standard rates." },
            specialPricing: "Reasoning and non-reasoning variants share published rates; verified separately per docs."
        }),
        pricingStatus: "verified",
        source: src("xai", "https://docs.x.ai/developers/pricing", "https://docs.x.ai/developers/models/grok-4.20-0309-reasoning")
    },

    "grok-4-5": {
        id: "grok-4-5", apiId: "grok-4.5", provider: "xai",
        name: "Grok 4.5", family: "Grok 4",
        type: "chat", status: "active", availability: "online",
        contextWindow: 500000, maxOutputTokens: null, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(2.00, 6.00, {
            cachedInput: 0.30,
            tiers: {
                shortContext: { input: 2.00, output: 6.00, cachedInput: 0.30 },
                longContext: { input: 4.00, output: 12.00, cachedInput: 0.60 }
            },
            longContextThreshold: 200000,
            batch: { input: 1.60, output: 4.80, note: "Batch API at 20% discount to standard rates." }
        }),
        pricingStatus: "verified",
        source: src("xai", "https://docs.x.ai/developers/pricing", "https://docs.x.ai/developers/models")
    },

    "grok-4-3": {
        id: "grok-4-3", apiId: "grok-4.3", provider: "xai",
        name: "Grok 4.3", family: "Grok 4",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1000000, maxOutputTokens: null, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(1.25, 2.50, {
            cachedInput: 0.20,
            tiers: {
                shortContext: { input: 1.25, output: 2.50, cachedInput: 0.20 },
                longContext: { input: 2.50, output: 5.00, cachedInput: 0.40 }
            },
            longContextThreshold: 200000,
            batch: { input: 1.00, output: 2.00, note: "Batch API at 20% discount to standard rates." }
        }),
        pricingStatus: "verified",
        source: src("xai", "https://docs.x.ai/developers/pricing", "https://docs.x.ai/developers/models")
    },

    /* ================= KIMI / MOONSHOT — ACTIVE (4) ================= */

    "kimi-k3": {
        id: "kimi-k3", apiId: "kimi-k3", provider: "moonshot",
        name: "Kimi K3", family: "Kimi K",
        type: "chat", status: "active", availability: "online",
        contextWindow: 1048576, maxOutputTokens: null, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(3.00, 15.00, {
            cachedInput: 0.30,
            specialPricing: "Flat pay-as-you-go; no context-length tiering. Cache-hit input $0.30/M."
        }),
        pricingStatus: "verified",
        source: src("moonshot", "https://platform.kimi.ai/docs/pricing/chat-k3", "https://platform.kimi.ai/docs/guide/kimi-k3-quickstart")
    },

    "kimi-k2-7-code": {
        id: "kimi-k2-7-code", apiId: "kimi-k2.7-code", provider: "moonshot",
        name: "Kimi K2.7 Code", family: "Kimi K",
        type: "chat", status: "active", availability: "online",
        contextWindow: 262144, maxOutputTokens: null, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.95, 4.00, {
            cachedInput: 0.19,
            specialPricing: "Coding-focused model; automatic context caching supported."
        }),
        pricingStatus: "verified",
        source: src("moonshot", "https://platform.kimi.ai/docs/pricing/chat-k27-code", "https://platform.kimi.ai/docs/pricing/chat-k27-code")
    },

    "kimi-k2-7-code-highspeed": {
        id: "kimi-k2-7-code-highspeed", apiId: "kimi-k2.7-code-highspeed", provider: "moonshot",
        name: "Kimi K2.7 Code Highspeed", family: "Kimi K",
        type: "chat", status: "active", availability: "online",
        contextWindow: 262144, maxOutputTokens: null, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(1.90, 8.00, {
            cachedInput: 0.38,
            specialPricing: "High-speed variant (~180 Tok/s, up to 260 Tok/s short context); same model, faster serving."
        }),
        pricingStatus: "verified",
        source: src("moonshot", "https://platform.kimi.ai/docs/pricing/chat-k27-code", "https://platform.kimi.ai/docs/pricing/chat-k27-code")
    },

    "kimi-k2-6": {
        id: "kimi-k2-6", apiId: "kimi-k2.6", provider: "moonshot",
        name: "Kimi K2.6", family: "Kimi K",
        type: "chat", status: "active", availability: "online",
        contextWindow: 262144, maxOutputTokens: null, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.95, 4.00, {
            cachedInput: 0.16,
            specialPricing: "General-purpose model; text, image and video input; thinking + non-thinking modes."
        }),
        pricingStatus: "verified",
        source: src("moonshot", "https://platform.kimi.ai/docs/pricing/chat-k26", "https://platform.kimi.ai/docs/pricing/chat-k26")
    },

    /* ================= OPENAI — ARCHIVED (10) =================
       Genuinely deprecated/retired generations only. Rates are
       last-documented historical prices (USD/M), kept so past
       workloads can still be estimated. */

    "gpt-4": {
        id: "gpt-4", apiId: "gpt-4", provider: "openai",
        name: "GPT-4", family: "GPT-4",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 8192, maxOutputTokens: 4096, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: false },
        pricing: px(30.00, 60.00),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", "2025-06-06", "official-documentation-historical")
    },

    "gpt-4-turbo": {
        id: "gpt-4-turbo", apiId: "gpt-4-turbo", provider: "openai",
        name: "GPT-4 Turbo", family: "GPT-4",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 128000, maxOutputTokens: 4096, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(10.00, 30.00),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", "2025-06-06", "official-documentation-historical")
    },

    "gpt-3.5-turbo": {
        id: "gpt-3.5-turbo", apiId: "gpt-3.5-turbo", provider: "openai",
        name: "GPT-3.5 Turbo", family: "GPT-3.5",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 16385, maxOutputTokens: 4096, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: false },
        pricing: px(0.50, 1.50),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", "2025-06-06", "official-documentation-historical")
    },

    "gpt-4o": {
        id: "gpt-4o", apiId: "gpt-4o", provider: "openai",
        name: "GPT-4o", family: "GPT-4o",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 128000, maxOutputTokens: 16384, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(2.50, 10.00, { cachedInput: 1.25, batch: { input: 1.25, output: 5.00 } }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", "2025-06-06", "official-documentation-historical")
    },

    "gpt-4o-mini": {
        id: "gpt-4o-mini", apiId: "gpt-4o-mini", provider: "openai",
        name: "GPT-4o Mini", family: "GPT-4o",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 128000, maxOutputTokens: 16384, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.15, 0.60, { cachedInput: 0.075, batch: { input: 0.075, output: 0.30 } }),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", "2025-06-06", "official-documentation-historical")
    },

    "gpt-4.5-preview": {
        id: "gpt-4.5-preview", apiId: "gpt-4.5-preview", provider: "openai",
        name: "GPT-4.5 Preview", family: "GPT-4.5",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 128000, maxOutputTokens: 16384, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(75.00, 150.00),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", "2025-06-06", "official-documentation-historical")
    },

    "o1": {
        id: "o1", apiId: "o1", provider: "openai",
        name: "o1", family: "o1",
        type: "reasoning", status: "archived", availability: "deprecated",
        contextWindow: 200000, maxOutputTokens: 100000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(15.00, 60.00),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", "2025-06-06", "official-documentation-historical")
    },

    "o1-mini": {
        id: "o1-mini", apiId: "o1-mini", provider: "openai",
        name: "o1-mini", family: "o1",
        type: "reasoning", status: "archived", availability: "deprecated",
        contextWindow: 128000, maxOutputTokens: 65536, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: false },
        pricing: px(1.10, 4.40),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", "2025-06-06", "official-documentation-historical")
    },

    "o3-mini": {
        id: "o3-mini", apiId: "o3-mini", provider: "openai",
        name: "o3-mini", family: "o3",
        type: "reasoning", status: "archived", availability: "deprecated",
        contextWindow: 200000, maxOutputTokens: 100000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: false },
        pricing: px(1.10, 4.40),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", "2025-06-06", "official-documentation-historical")
    },

    "o4-mini": {
        id: "o4-mini", apiId: "o4-mini", provider: "openai",
        name: "o4-mini", family: "o4",
        type: "reasoning", status: "archived", availability: "deprecated",
        contextWindow: 200000, maxOutputTokens: 100000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: false },
        pricing: px(1.10, 4.40),
        pricingStatus: "verified",
        source: src("openai", OPENAI_PRICING_DOC, "https://developers.openai.com/api/docs/models", "2025-06-06", "official-documentation-historical")
    },

    /* ================= GOOGLE GEMINI — ARCHIVED (5) ================= */

    "gemini-2.0-flash": {
        id: "gemini-2.0-flash", apiId: "gemini-2.0-flash", provider: "google",
        name: "Gemini 2.0 Flash", family: "Gemini 2.0",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 1000000, maxOutputTokens: 8192, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.10, 0.40, { cachedInput: 0.025 }),
        pricingStatus: "verified",
        source: src("google", "https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/docs/models", "2026-03-01", "official-documentation-historical")
    },

    "gemini-2.0-flash-lite": {
        id: "gemini-2.0-flash-lite", apiId: "gemini-2.0-flash-lite", provider: "google",
        name: "Gemini 2.0 Flash-Lite", family: "Gemini 2.0",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 1000000, maxOutputTokens: 8192, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.075, 0.30, { cachedInput: 0.02 }),
        pricingStatus: "verified",
        source: src("google", "https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/docs/models", "2026-03-01", "official-documentation-historical")
    },

    "gemini-1.5-pro": {
        id: "gemini-1.5-pro", apiId: "gemini-1.5-pro", provider: "google",
        name: "Gemini 1.5 Pro", family: "Gemini 1.5",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 2000000, maxOutputTokens: 8192, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(1.25, 5.00),
        pricingStatus: "verified",
        source: src("google", "https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/docs/models", "2025-09-01", "official-documentation-historical")
    },

    "gemini-1.5-flash": {
        id: "gemini-1.5-flash", apiId: "gemini-1.5-flash", provider: "google",
        name: "Gemini 1.5 Flash", family: "Gemini 1.5",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 1000000, maxOutputTokens: 8192, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.075, 0.30),
        pricingStatus: "verified",
        source: src("google", "https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/docs/models", "2025-09-01", "official-documentation-historical")
    },

    "gemini-1.0-pro": {
        id: "gemini-1.0-pro", apiId: "gemini-1.0-pro", provider: "google",
        name: "Gemini 1.0 Pro", family: "Gemini 1.0",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 32768, maxOutputTokens: 2048, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: false },
        pricing: px(0.50, 1.50),
        pricingStatus: "verified",
        source: src("google", "https://ai.google.dev/gemini-api/docs/pricing", "https://ai.google.dev/gemini-api/docs/models", "2025-02-15", "official-documentation-historical")
    },

    /* ================= ANTHROPIC — ARCHIVED (5) ================= */

    "claude-opus-3": {
        id: "claude-opus-3", apiId: "claude-3-opus-20240229", provider: "anthropic",
        name: "Claude Opus 3", family: "Claude 3",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 200000, maxOutputTokens: 4096, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(15.00, 75.00),
        pricingStatus: "verified",
        source: src("anthropic", "https://platform.claude.com/docs/en/about-claude/pricing", "https://platform.claude.com/docs/en/about-claude/model-deprecations", "2025-01-01", "official-documentation-historical")
    },

    "claude-sonnet-3-5": {
        id: "claude-sonnet-3-5", apiId: "claude-3-5-sonnet-20241022", provider: "anthropic",
        name: "Claude Sonnet 3.5", family: "Claude 3.5",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 200000, maxOutputTokens: 8192, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(3.00, 15.00),
        pricingStatus: "verified",
        source: src("anthropic", "https://platform.claude.com/docs/en/about-claude/pricing", "https://platform.claude.com/docs/en/about-claude/model-deprecations", "2025-10-01", "official-documentation-historical")
    },

    "claude-sonnet-3-7": {
        id: "claude-sonnet-3-7", apiId: "claude-3-7-sonnet-20250219", provider: "anthropic",
        name: "Claude Sonnet 3.7", family: "Claude 3.7",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 200000, maxOutputTokens: 64000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(3.00, 15.00),
        pricingStatus: "verified",
        source: src("anthropic", "https://platform.claude.com/docs/en/about-claude/pricing", "https://platform.claude.com/docs/en/about-claude/model-deprecations", "2026-02-01", "official-documentation-historical")
    },

    "claude-haiku-3": {
        id: "claude-haiku-3", apiId: "claude-3-haiku-20240307", provider: "anthropic",
        name: "Claude Haiku 3", family: "Claude 3",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 200000, maxOutputTokens: 4096, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.25, 1.25),
        pricingStatus: "verified",
        source: src("anthropic", "https://platform.claude.com/docs/en/about-claude/pricing", "https://platform.claude.com/docs/en/about-claude/model-deprecations", "2025-01-01", "official-documentation-historical")
    },

    "claude-haiku-3-5": {
        id: "claude-haiku-3-5", apiId: "claude-3-5-haiku-20241022", provider: "anthropic",
        name: "Claude Haiku 3.5", family: "Claude 3.5",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 200000, maxOutputTokens: 8192, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: true },
        pricing: px(0.80, 4.00),
        pricingStatus: "verified",
        source: src("anthropic", "https://platform.claude.com/docs/en/about-claude/pricing", "https://platform.claude.com/docs/en/about-claude/model-deprecations", "2026-01-01", "official-documentation-historical")
    },

    /* ================= DEEPSEEK — ARCHIVED (2) =================
       V3 / R1 generation superseded by V4. Kept for history. */

    "deepseek-v3": {
        id: "deepseek-v3", apiId: "deepseek-chat", provider: "deepseek",
        name: "DeepSeek V3 (legacy alias deepseek-chat)", family: "DeepSeek V3",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 256000, maxOutputTokens: 8000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: false },
        pricing: px(0.27, 1.10, {
            cachedInput: 0.07,
            specialPricing: "Legacy standard rate; off-peak historic discounts retired. deepseek-chat now aliases V4 Flash."
        }),
        pricingStatus: "verified",
        source: src("deepseek", "https://api-docs.deepseek.com/quick_start/pricing/", "https://api-docs.deepseek.com/", "2026-04-01", "official-documentation-historical")
    },

    "deepseek-r1": {
        id: "deepseek-r1", apiId: "deepseek-reasoner", provider: "deepseek",
        name: "DeepSeek R1 (legacy alias deepseek-reasoner)", family: "DeepSeek R1",
        type: "reasoning", status: "archived", availability: "deprecated",
        contextWindow: 256000, maxOutputTokens: 8000, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: false },
        pricing: px(0.55, 2.19, {
            cachedInput: 0.14,
            specialPricing: "Legacy reasoning rate incl. CoT tokens. deepseek-reasoner now aliases V4 Flash thinking mode."
        }),
        pricingStatus: "verified",
        source: src("deepseek", "https://api-docs.deepseek.com/quick_start/pricing/", "https://api-docs.deepseek.com/", "2026-04-01", "official-documentation-historical")
    },

    /* ================= KIMI / MOONSHOT — ARCHIVED (1) =================
       kimi-k2 series officially discontinued 2026-05-25. */

    "kimi-k2": {
        id: "kimi-k2", apiId: "kimi-k2", provider: "moonshot",
        name: "Kimi K2", family: "Kimi K",
        type: "chat", status: "archived", availability: "deprecated",
        contextWindow: 262144, maxOutputTokens: null, deployment: "cloud",
        capabilities: { textInput: true, textOutput: true, imageInput: false },
        pricing: px(0.60, 2.50, {
            cachedInput: 0.15,
            specialPricing: "Discontinued 2026-05-25 per official notice; use Kimi K3."
        }),
        pricingStatus: "verified",
        source: src("moonshot", "https://platform.kimi.ai/docs/pricing/chat", "https://platform.kimi.ai/docs/pricing/chat-v1", "2026-05-25", "official-documentation-historical")
    }

    /* NOTE: Mistral and xAI have NO archived entries — there is
       no reliable official evidence of a deprecated model in
       scope, and the catalogue must not manufacture one. */

};


/* NOTE: catalogue entries are consumed as-written (no normalization
   pass — the added metadata fields had no readers). */


/* ================= ESM EXPORTS ================= */

export {
    DATA_VERIFIED_AT,
    PRICING_UNIT,
    PRICING_CURRENCY,
    PROVIDERS,
    MODEL_FAMILIES
};
