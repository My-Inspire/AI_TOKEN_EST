# AI Cost Monitor V3 — API Reference

Base URL is the backend origin (it serves the frontend too, so same-origin by default). AI amounts are **INR** (USD catalogue converted once server-side). GPU IndiaAI amounts are **INR/hr native** (never fx-converted).

## Rate precedence

Per-request `exchangeRate` (validated, must be > 0) → `RATE_USD_INR` env → catalogue default (94.50 as of 2026-09-04). An explicitly invalid rate returns **400**. Frontend display may convert back to USD for the ₹/$ toggle — never a second conversion of stored amounts.

## Endpoints

### GET /api/models
Picker data. → `{ models: [{id, name, family, provider, status, deployment, pricingStatus, hasPricing, contextWindow}], providers, counts }`

### GET /api/pricing
Transparency table. → `{ currency: "INR", unit, sourceCurrency: "USD", usdToInr, asOf, note, rates: {id: {input, output, cachedInput, cacheWrite, batch, tiers, longContextThreshold, specialPricing, pricingStatus}}, verification }`

### GET /api/config
UI metadata. → `{ scenarios, maxFileSizeMB, currency, usdToInr, asOf, gpuIndiaAI: {totalInstances, byOem, currency, unit, verifiedAt, source}, estimateRefs: true, gpuPricingTiers, gpuDefaultTier }`

### GET /api/gpus
IndiaAI picker data. → `{ currency: "INR", unit: "PER_HOUR_PER_INSTANCE", defaultPricingTier: "onDemand", pricingTiers, oems, instances: [{id, oem, gpuType, instanceType, cards, memoryGB, specs, pricing: {onDemand, reserved1M, reserved6M, reserved12M}}], summary }`

### POST /api/calculate
Body: `{ serviceCategory?, modelId, prompt?, fileText?, fileMeta? {name, size}, parseMeta?, files? [{fileText?, fileRef?, fileMeta?, parseMeta?}], outputTokens?, monthlyRequests?, useCachedInput?, pricingMode? ("standard"|"batch"), gpuConfig? {gpuInstanceId?, gpuPricingTier? ("onDemand"|"reserved1M"|"reserved6M"|"reserved12M"), hourlyCost? (IndiaAI rate override), runtimeHours?}, exchangeRate? }`
`fileRef` (from `/api/files/parse`) is preferred over `fileText` — the server resolves the cached parse text, so calculate payloads stay tiny for enterprise-size files. Unknown/expired refs degrade to a labelled size fallback, never an error.
→ `{ result, rate, currency }`. Unknown model → 200 with `result.error` set (never a fabricated cost). GPU infra applies whenever `gpuConfig` carries an IndiaAI instance or hourly override (any AI deployment).

### POST /api/compare
Same body as calculate. → `{ estimate, rows, archivedRows, summary, recommendation, rate, currency }`. `rows` is the active-only leaderboard (cheapest first); `archivedRows` ships alongside for group-aware consumers. Token counts are estimated with the selected model's reference so the selected row matches `/calculate`. Recommendation items carry raw numbers (`data.*`); the frontend formats them.

### POST /api/reports
Same body as calculate. → `{ scenarios, model: {id, name}, totalTokens, costPerRequest, currency }`. The `current` scenario scales with the request's own `monthlyRequests`; the other four use fixed preset volumes. Unknown model → 400.

### POST /api/files/parse
Multipart (`file` + optional `modelId`) or JSON (`{filename, mime?, text?, size?, parseMeta?, modelId?}`).
- Text-native and office/PDF files parse server-side → 200 `{ result: ParserResult, tokens, ref }` (`ref` is the estimate reference for later calculate calls).
- Images and unsupported formats → **415** `{ error, unsupported: true, format }` (frontend falls back to bundled OCR/vendors).
- Oversize → **413**. Bad input → **400**.
- JSON `{filename, size}` (no content) → 200 `{ result: null, tokens: <size estimate>, sizeOnly: true }`.
- JSON `{filename, text, parseMeta?, modelId?}` → token estimate for already-extracted text.

## Errors
`{ error: string }` with 400 / 404 / 413 / 415 / 500. No stack traces leak to clients.

## Vendor security (frontend/vendor/, self-hosted, no CDN)

Backend has zero npm dependencies; the only third-party code is vendored
browser fallbacks. Backend parsers in `backend/parsers/` are authoritative —
vendor libs run only as an offline/client fallback.

| File | Version | SHA-256 | Notes |
|---|---|---|---|
| jszip.min.js | 3.10.2 | 7F839B2D4688B845C105EBF5D2F9803075F91EA0FE72BDAAC176C3A04DD3D2C1 | Patched 2026-09-09; PPTX path caps entries/slides + rejects `..` |
| xlsx.full.min.js | 0.20.3 | CC015130AA8521E7F088F88898EBA949CCDCBFB38DF0BD129B44B7273C3A6F41 | Fixes CVE-2023-30533 / CVE-2024-22363 era issues; read with `WTF:false, bookVBA:false, cellHTML:false` + sheet/row/cell caps |
| pdf.min.js | 3.x-era (©2023) | 5B5799E6F8C680663207AC5B42EE14EED2A406FA7AF48F50C154F0C0B1566946 | CVE-2024-4367 mitigated via `isEvalSupported:false` + CSP without `unsafe-eval`; 200-page cap. Kept at 3.x UMD because 4.x is ESM-only and needs a loader rewrite |
| pdf.worker.min.js | 3.x-era (©2023) | FEABDF309770ED24BBA31A5467836CDC8CF639C705AF27D52B585B041BB8527B | Same as above |
| mammoth.browser.min.js | 1.12.2 | E660D427DDB9AAF51CF4CA237512D0776141A58F0DFB0FD58B576721E8195E2B | Fixes CVE-2025-11849 / CVE-2026-97151; browser build blocks external images; raw-text only |
| tesseract.min.js | pinned vendor | BE397E903F26199D428B528E8D834CDCA8064F95C82068FA34EC8C4D34FD9DE9 | Self-hosted worker/core/lang paths only |
| tesseract.worker.min.js | pinned vendor | 2BCC88EFB897E6A39517A05325B95E15A59E2BAE1C74DEE3DEAFB5A56AEF846F | Same as above |
| tesseract-core.wasm.js | pinned vendor | FE68F746DC186BB19E2C55DE3514D3D6C4036EDE53488B5A4DB00DFE3F75E5F1 | Same as above |
| tesseract-core-simd.wasm.js | pinned vendor | EC8537B758625825ADD9E3EC3EB9E10B5FC574FADC681A2DA1357050CDC5ED43 | Same as above |

Security headers on all responses: `nosniff`, `SAMEORIGIN`, `no-referrer`,
minimal `Permissions-Policy`, and CSP `script-src 'self' 'unsafe-inline'`
(no `unsafe-eval`), `worker-src 'self' blob:`, `object-src 'none'`.
Upgrade path: `node scripts/pin-vendor.cjs --fetch` re-downloads the three
pinned builds from the authoritative URLs above, then update this
table + `getVendorManifest()` in `frontend/services/files.js`, re-run tests.
