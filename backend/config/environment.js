/* =========================================================
   Environment configuration. No secrets live here — only
   deployment knobs with safe defaults. Never commit real
   secrets; copy .env.example to .env for local overrides.
   (Plain process.env reads; no dotenv dependency.)
   ========================================================= */

function int(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

function str(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
    return String(raw);
}

export const env = {
    PORT: int("PORT", 3000),
    HOST: str("HOST", "127.0.0.1"),
    MAX_FILE_MB: int("MAX_FILE_MB", 50),
    // Optional authoritative rate override (else catalogue default).
    RATE_USD_INR: (() => {
        const raw = process.env.RATE_USD_INR;
        if (raw === undefined || raw === null || String(raw).trim() === "") return null;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
    })()
};
