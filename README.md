# AI Cost Monitor V3

Token estimation, model pricing, scenario analysis and IndiaAI GPU infrastructure modelling. Vanilla HTML/CSS/JS (ES modules) frontend + zero-dependency Node backend. No runtime dependencies.

## Run

```sh
node backend/server.js
# → http://127.0.0.1:3000
```

Optional env (see `.env.example`): `PORT`, `HOST`, `MAX_FILE_MB`, `RATE_USD_INR`.

```sh
npm test   # node --test over tests/backend + tests/frontend
```

ES modules require HTTP — the backend serves `frontend/` itself, so one command runs everything.

## Architecture

```text
frontend/  presentation — views, components, routing, state,
           prefs, formatting, API clients, browser file fallback
backend/   authority — catalogue, pricing, token/cost/GPU/
           comparison/recommendation/scenario logic, parsers,
           validation, API routes
```

- One implementation of each formula lives in `backend/services/`.
- Catalogue USD pricing converts to INR exactly once, server-side. IndiaAI GPU INR/hr is used verbatim (On-Demand default; reserved tiers kept side-by-side).
- GPU picker (OEM → Type → Instance, 73 IndiaAI rows) lives alongside the AI model picker; infra applies to any deployment when selected.
- Images/OCR stay in the browser (bundled Tesseract); the backend
  answers 415 so the fallback path is explicit, never silent.
- Display currency (₹/$) and text size are session preferences.

See `docs/api.md` for endpoints.
