/* =========================================================
   AI Cost Monitor V3 — zero-dependency Node backend.
   Serves frontend/ statically and exposes /api/*.
   Listens only when run directly (import-safe for tests).

   Run:  node backend/server.js   (serves http://HOST:PORT)
   ========================================================= */

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/environment.js";
import { handleModels } from "./routes/models.js";
import { handlePricing } from "./routes/pricing.js";
import { handleCalculate } from "./routes/calculate.js";
import { handleCompare } from "./routes/compare.js";
import { handleFilesParse } from "./routes/files.js";
import { handleReports } from "./routes/reports.js";
import { handleGpus } from "./routes/gpus.js";
import { listScenarios } from "./services/scenarioService.js";
import { GPU_PRICING_TIERS, GPU_DEFAULT_TIER } from "./services/gpuService.js";
import { EXCHANGE_RATE_DEFAULT } from "./data/pricing.js";
import { getGpuSummary } from "./data/gpuIndiaAI.js";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const FRONTEND_DIR = join(ROOT, "frontend");

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".wasm": "application/wasm",
    ".gz": "application/gzip",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8"
};

/* Security headers (2026-09-26 audit, OCR exception added after the
   Tesseract console errors proved two directives blocked it):
   - CSP deliberately omits 'unsafe-eval': this is the server-side
     half of the CVE-2024-4367 (pdf.js FontMatrix) mitigation; the
     client half is isEvalSupported:false in frontend/services/files.js.
     'wasm-unsafe-eval' is allowlisted INSTEAD: it permits WebAssembly
     compilation (the vendored Tesseract core needs it) without
     permitting eval(), so the pdf.js mitigation stays intact.
   - connect-src gains data: because the Emscripten core fetches its
     embedded wasm binary as a data: URI (no network exfiltration —
     data: URLs have no host to leak to).
   - 'unsafe-inline' is retained for scripts/styles because index.html
     uses an inline theme-preference snippet and components use inline
     styles; no eval is allowed. */
const SECURITY_HEADERS = Object.freeze({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "connect-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'"
    ].join("; ")
});

function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(payload),
        ...SECURITY_HEADERS
    });
    res.end(payload);
}

function readBody(req, limitBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let tooLarge = false;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > limitBytes) {
                tooLarge = true;
            } else {
                chunks.push(chunk);
            }
        });
        req.on("end", () => {
            if (tooLarge) reject(Object.assign(new Error("Request too large — reduce file size or file count and retry."), { status: 413 }));
            else resolve(Buffer.concat(chunks));
        });
        req.on("error", reject);
    });
}

/* Minimal multipart/form-data parser (single file field + fields). */
function parseMultipart(buffer, boundary) {
    const fields = {};
    const files = [];
    const delimiter = Buffer.from("--" + boundary);
    let start = 0;
    const parts = [];
    for (;;) {
        const begin = buffer.indexOf(delimiter, start);
        if (begin < 0) break;
        const next = buffer.indexOf(delimiter, begin + delimiter.length);
        parts.push(buffer.subarray(begin + delimiter.length, next < 0 ? buffer.length : next));
        if (next < 0) break;
        start = next;
        if (buffer.subarray(next + delimiter.length, next + delimiter.length + 2).toString() === "--") break;
    }
    for (const part of parts) {
        const headerEnd = part.indexOf("\r\n\r\n");
        if (headerEnd < 0) continue;
        const headers = part.subarray(0, headerEnd).toString("latin1");
        let content = part.subarray(headerEnd + 4);
        if (content.length >= 2 && content[content.length - 2] === 0x0D && content[content.length - 1] === 0x0A) {
            content = content.subarray(0, content.length - 2);
        }
        const nameMatch = headers.match(/name="([^"]*)"/);
        const fileMatch = headers.match(/filename="([^"]*)"/);
        const typeMatch = headers.match(/Content-Type:\s*([^\r\n;]+)/i);
        if (!nameMatch) continue;
        if (fileMatch) {
            files.push({
                field: nameMatch[1],
                filename: fileMatch[1],
                mime: (typeMatch?.[1] || "application/octet-stream").trim(),
                buffer: Buffer.from(content)
            });
        } else {
            fields[nameMatch[1]] = content.toString("utf8");
        }
    }
    return { fields, files };
}

async function parseBody(req) {
    const contentType = req.headers["content-type"] || "";
    /* JSON carries extracted file texts (up to 20 files × up to MAX_FILE_MB
       of text), so the cap must cover multi-file workloads — not just forms. */
    const maxJson = 25 * 1024 * 1024;
    const maxFile = (env.MAX_FILE_MB + 5) * 1024 * 1024;
    if (contentType.startsWith("multipart/form-data")) {
        const boundary = contentType.split("boundary=")[1];
        if (!boundary) {
            const error = new Error("Malformed multipart request.");
            error.status = 400;
            throw error;
        }
        const buffer = await readBody(req, maxFile);
        return { kind: "multipart", ...parseMultipart(buffer, boundary) };
    }
    const buffer = await readBody(req, maxJson);
    if (!buffer.length) return { kind: "json", body: {} };
    try {
        return { kind: "json", body: JSON.parse(buffer.toString("utf8")) };
    } catch {
        const error = new Error("Request body must be valid JSON.");
        error.status = 400;
        throw error;
    }
}

async function serveStatic(req, res, pathname) {
    let relative;
    try {
        relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
    } catch {
        return sendJson(res, 400, { error: "Malformed URL." });
    }
    const safe = normalize(relative).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
    const filePath = join(FRONTEND_DIR, safe);
    if (!filePath.startsWith(FRONTEND_DIR + sep) && filePath !== FRONTEND_DIR) {
        return sendJson(res, 403, { error: "Forbidden." });
    }
    try {
        const info = await stat(filePath);
        if (!info.isFile()) return sendJson(res, 404, { error: "Not found." });
        const data = await readFile(filePath);
        res.writeHead(200, {
            "Content-Type": MIME[extname(filePath).toLowerCase()] || "application/octet-stream",
            ...SECURITY_HEADERS
        });
        res.end(data);
    } catch {
        sendJson(res, 404, { error: "Not found." });
    }
}

function handleConfig() {
    return {
        status: 200,
        json: {
            scenarios: listScenarios(),
            maxFileSizeMB: env.MAX_FILE_MB,
            currency: "INR",
            usdToInr: env.RATE_USD_INR ?? EXCHANGE_RATE_DEFAULT.USD_TO_INR,
            asOf: EXCHANGE_RATE_DEFAULT.asOf,
            gpuIndiaAI: getGpuSummary(),
            estimateRefs: true,
            gpuPricingTiers: GPU_PRICING_TIERS,
            gpuDefaultTier: GPU_DEFAULT_TIER
        }
    };
}

export function createApp() {
    return async (req, res) => {
        try {
            const url = new URL(req.url, "http://localhost");
            const pathname = url.pathname;

            if (req.method === "GET" && pathname === "/api/models") {
                const out = await handleModels();
                return sendJson(res, out.status, out.json);
            }
            if (req.method === "GET" && pathname === "/api/pricing") {
                const out = await handlePricing();
                return sendJson(res, out.status, out.json);
            }
            if (req.method === "GET" && pathname === "/api/config") {
                return sendJson(res, 200, handleConfig().json);
            }
            if (req.method === "GET" && pathname === "/api/gpus") {
                const out = await handleGpus();
                return sendJson(res, out.status, out.json);
            }
            if (pathname === "/api/calculate" && req.method === "POST") {
                const parsed = await parseBody(req);
                const out = await handleCalculate(parsed.kind === "json" ? parsed.body : {});
                return sendJson(res, out.status, out.json);
            }
            if (pathname === "/api/compare" && req.method === "POST") {
                const parsed = await parseBody(req);
                const out = await handleCompare(parsed.kind === "json" ? parsed.body : {});
                return sendJson(res, out.status, out.json);
            }
            if (pathname === "/api/reports" && req.method === "POST") {
                const parsed = await parseBody(req);
                const out = await handleReports(parsed.kind === "json" ? parsed.body : {});
                return sendJson(res, out.status, out.json);
            }
            if (pathname === "/api/files/parse" && req.method === "POST") {
                const parsed = await parseBody(req);
                const out = parsed.kind === "multipart"
                    ? await handleFilesParse({ fields: parsed.fields, files: parsed.files })
                    : await handleFilesParse({ fields: parsed.body, files: [] });
                return sendJson(res, out.status, out.json);
            }
            if (pathname.startsWith("/api/")) {
                return sendJson(res, 404, { error: "Unknown API endpoint." });
            }
            return serveStatic(req, res, pathname);
        } catch (error) {
            /* Client errors (400/404/413/415) are routine traffic — only
               unexpected failures deserve server-log noise. */
            if (!error.status || error.status >= 500) console.error("request failed:", error);
            sendJson(res, error.status || 500, { error: error.status ? error.message : "Unexpected server error." });
        }
    };
}

export function startServer(port = env.PORT, host = env.HOST) {
    return new Promise((resolve) => {
        const server = http.createServer(createApp());
        server.listen(port, host, () => {
            const address = server.address();
            console.log(`AI Cost Monitor backend on http://${address.address}:${address.port}`);
            resolve(server);
        });
    });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
    startServer();
}
