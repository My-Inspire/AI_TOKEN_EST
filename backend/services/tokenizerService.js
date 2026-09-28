/* =========================================================
   Tokenizer service (zero-dependency, offline, deterministic).

   Replaces the flat `chars / 4` heuristic with GPT-style
   pre-tokenization + per-provider calibration:

   - pretoken regex groups letters / digits / punctuation /
     whitespace (leading spaces merge into the word, as in BPE)
   - CJK chars count ~1 token each (not 0.25)
   - digits split ~3 per token, punctuation ~2 chars per token
   - short English words (<=6 chars) count as 1 token
   - emoji count ~2-3 tokens each

   This is still an ESTIMATE (source stays "heuristic" upstream)
   — byte-exact BPE would need vendored vocab files (~1MB+) or
   provider APIs. It is strictly closer than chars/4 for CJK,
   code/JSON, numbers and emoji while identical in spirit for
   plain English prose.

   Pure functions, no I/O, safe to import in tests.
   On any unexpected input the caller should fall back to the
   legacy chars-per-token math (see tokenService.js).
   ========================================================= */

export const TOKENIZER_VERSION = "1.0";

export const TOKENIZER_FAMILIES = {
    openai: "bpe-cl100k-like",
    google: "sentencepiece-like",
    anthropic: "claude-like",
    deepseek: "deepseek-like",
    mistral: "mistral-tekken-like",
    xai: "grok-bpe-like",
    moonshot: "kimi-bpe-like",
    custom: "generic-bpe-like"
};

/* chars-per-token for running alpha text, digits, punctuation;
   CJK / emoji are tokens-per-char (denser than latin). */
const PROVIDER_PARAMS = {
    openai: { alpha: 4.4, digits: 2.8, punct: 2.0, cjk: 1.15, emoji: 2.6 },
    google: { alpha: 4.1, digits: 2.7, punct: 1.9, cjk: 1.1, emoji: 2.5 },
    anthropic: { alpha: 3.6, digits: 2.5, punct: 1.8, cjk: 1.0, emoji: 2.4 },
    deepseek: { alpha: 3.6, digits: 2.5, punct: 1.8, cjk: 1.0, emoji: 2.4 },
    mistral: { alpha: 4.0, digits: 2.7, punct: 1.9, cjk: 1.1, emoji: 2.5 },
    xai: { alpha: 4.0, digits: 2.7, punct: 1.9, cjk: 1.1, emoji: 2.5 },
    moonshot: { alpha: 4.0, digits: 2.7, punct: 1.9, cjk: 1.05, emoji: 2.5 },
    custom: { alpha: 4.0, digits: 2.7, punct: 1.9, cjk: 1.1, emoji: 2.5 }
};

function getParams(providerId, modelType) {
    const base = PROVIDER_PARAMS[providerId] || PROVIDER_PARAMS.custom;
    /* Reasoning models expose the same tokenizer but prompts skew
       toward symbols/numbers — apply the documented small uplift. */
    if (modelType === "reasoning") {
        return { ...base, alpha: base.alpha * 0.9, digits: base.digits * 0.92 };
    }
    return base;
}

export function getTokenizerInfo(providerId) {
    return {
        version: TOKENIZER_VERSION,
        family: TOKENIZER_FAMILIES[providerId] || TOKENIZER_FAMILIES.custom,
        provider: providerId || "custom"
    };
}

const CJK_GLOBAL_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const EMOJI_GLOBAL_RE = /\p{Extended_Pictographic}/gu;

/* GPT-2 style pretokenizer: contractions, letter runs, digit runs,
   punctuation runs (each with optional leading space), whitespace. */
const PRETOKEN_PATTERN =
    "'s|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^\\s\\p{L}\\p{N}]+|\\s+(?!\\S)|\\s+";

function pretokenize(text) {
    try {
        return text.match(new RegExp(PRETOKEN_PATTERN, "gu")) || [];
    } catch {
        return null;
    }
}

function estimateAlphaLen(len, alpha) {
    if (len <= 0) return 0;
    if (len <= 6) return 1;
    if (len <= 12) return 2;
    return Math.ceil(len / alpha);
}

function countPretoken(pretoken, params) {
    if (!pretoken) return 0;
    if (/^\s+$/.test(pretoken)) {
        /* Isolated whitespace (newlines/indentation). Single spaces
           normally merge into the following word, so lone runs are
           cheap: ~1 token per 10 chars. */
        return Math.max(1, Math.ceil(pretoken.length / 10));
    }
    const core = pretoken.startsWith(" ") ? pretoken.slice(1) : pretoken;
    if (!core) return 0;
    const codePoints = Array.from(core);

    /* CJK-heavy pieces: each Han/Hiragana/Katakana/Hangul char is
       roughly one token; remaining latin/digits use alpha math. */
    const cjkChars = (core.match(CJK_GLOBAL_RE) || []).length;
    if (cjkChars > 0) {
        const cjkTokens = Math.ceil(cjkChars * params.cjk);
        const rest = core.replace(new RegExp(CJK_GLOBAL_RE.source, "gu"), "");
        if (!rest) return Math.max(1, cjkTokens);
        return Math.max(1, cjkTokens) + estimateMixedRest(rest, params);
    }

    /* Emoji-heavy pieces: each pictograph costs ~2-3 tokens. */
    let emojiCount = 0;
    try {
        emojiCount = (core.match(EMOJI_GLOBAL_RE) || []).length;
    } catch {
        emojiCount = 0;
    }
    if (emojiCount > 0) {
        const emojiTokens = Math.ceil(emojiCount * params.emoji);
        const rest = core.replace(new RegExp(EMOJI_GLOBAL_RE.source, "gu"), "").trim();
        if (!rest) return Math.max(1, emojiTokens);
        return Math.max(1, emojiTokens) + estimateMixedRest(rest, params);
    }

    return estimateMixedRest(core, params);
}

function estimateMixedRest(core, params) {
    if (/^\p{N}+$/u.test(core)) {
        return Math.max(1, Math.ceil(core.length / params.digits));
    }
    if (/^[^\p{L}\p{N}\s]+$/u.test(core)) {
        return Math.max(1, Math.ceil(Array.from(core).length / params.punct));
    }
    /* Mixed alnum/symbol word: split into letter / digit / symbol
       runs so "gpt-5.4" or "abc123" don't collapse to 1 token. */
    const runs = core.match(/\p{L}+|\p{N}+|[^\p{L}\p{N}\s]+/gu) || [core];
    if (runs.length === 1) {
        return estimateAlphaLen(Array.from(core).length, params.alpha);
    }
    let total = 0;
    for (const run of runs) {
        if (/^\p{N}+$/u.test(run)) total += Math.max(1, Math.ceil(run.length / params.digits));
        else if (/^[^\p{L}\p{N}\s]+$/u.test(run)) total += Math.max(1, Math.ceil(Array.from(run).length / params.punct));
        else total += estimateAlphaLen(Array.from(run).length, params.alpha);
    }
    return Math.max(1, total);
}

/* Main entry: deterministic text → token estimate.
   Never throws — returns null on internal failure so callers can
   fall back to the legacy chars-per-token math. */
export function countTextTokens(text, { provider = "custom", modelType = "chat" } = {}) {
    try {
        if (typeof text !== "string") return null;
        const trimmed = text.trim();
        if (!trimmed) {
            return { tokens: 0, pretokens: 0, chars: 0, effectiveCharsPerToken: 0, ...getTokenizerInfo(provider) };
        }
        const params = getParams(provider, modelType);
        const pieces = pretokenize(trimmed);
        if (!pieces) return null;
        let tokens = 0;
        for (const piece of pieces) tokens += countPretoken(piece, params);
        tokens = Math.max(1, tokens);
        const chars = trimmed.length;
        return {
            tokens,
            pretokens: pieces.length,
            chars,
            effectiveCharsPerToken: chars / tokens,
            ...getTokenizerInfo(provider)
        };
    } catch {
        return null;
    }
}
