# AI Token Cost Monitor V3 — User Guide

**What it is:** a web app that answers *"What will this AI workload cost?"* before you spend anything. You describe a workload (prompt + optional files), pick a model, and it generates token estimates, per-request/monthly/annual costs, cheaper-model comparisons, savings suggestions, and growth-scenario reports.

**The value it generates:**
- Token breakdown — prompt vs. file tokens, total input, total per request.
- Cost per request, per month, per year (+ per-1K / per-1M unit rates).
- A ranked comparison of ~50 active models for your exact workload, with the cheapest alternative and potential savings highlighted.
- Actionable suggestions (e.g. switch models, use cached input, compress prompts).
- Scenario projections (low → very high usage) with a printable report.
- Session dashboard: KPIs, cost trend chart, usage distribution, activity log.

All math runs server-side from verified catalogue pricing (AI rates in USD converted to INR; IndiaAI GPU rates already INR-native); figures show source and verification date. Nothing is hardcoded or fabricated — empty states stay empty until you calculate.

---

## 1. Getting started

```sh
node backend/server.js
# open http://127.0.0.1:3000
```

> If calculations ever look wrong after an update (e.g. file tokens stuck at 0), restart the backend process and hard-refresh the browser (Ctrl+Shift+R) so both halves run the same version.

---

## 2. The core workflow: Calculator (3 steps)

### Step 1 — Input
1. **Service Classification** (required) — pick the category matching your workload.
2. **AI Model** (required) — cascading picker: Active / Archived → provider → model.
3. **GPU Model** (optional) — cascading picker: OEM → GPU Type → Instance (IndiaAI on-demand rates), plus runtime hours per day. Adds infrastructure cost alongside the API estimate for any deployment.
4. **Upload workload files** (optional) — click or drag-and-drop. **You can select multiple files at once, or add more in batches**; each file is parsed independently and listed as its own row:
   - `×  filename.pdf  3.9 KB  PDF` + status (Extracting… / Content extracted / warning / error).
   - The small grey **× on the left removes only that file**; removing updates all totals. Re-selecting an already-listed file is skipped with a notice.
   - Supported: PDF, DOCX, TXT, XLSX, CSV, PPTX, images (OCR), JSON, XML, MD. Max 10 files; per-file size limit shown on oversized files.
   - Labels to know: *Size-based fallback* = content wasn't readable, estimate from file size (may differ significantly); *Parsed in your browser* = server was unreachable during parsing.
5. **Prompt / instructions** (optional) — the text your workload will process. Files, prompt, or both.
6. **Scale & options** — expected output tokens, monthly requests, usage-scenario preset, and cached-input pricing (where published).
7. Click **Continue to Token Analysis**.

### Step 2 — Token Analysis
Shows **Prompt tokens**, **File tokens** (exact sum of every file), **Total input**, the input/output composition bar, and a per-file breakdown with estimation badges (exact / extracted / image approx. / size fallback). Then **Calculate Cost**.

> **Important limitation:** token counts are **provider-calibrated token estimates, not exact tokenizer outputs**. Counting is calibrated per provider family, so figures may differ slightly from the usage your provider reports. Treat every cost as an estimate.

### Step 3 — Cost Result
Cost per request (hero figure), per-1K/per-1M rates, monthly + yearly projections, pricing source. With a GPU selected, a GPU infrastructure section adds GPU/month, GPU/year and the combined total. If inputs change afterwards, a *"re-run to refresh"* notice appears. Buttons lead to **Compare Models** and **Suggestions**.

---

## 3. Compare Models
Ranks every active model on your workload: total tokens, cost/request, monthly/annual cost, per-1K/per-1M rates. The cheapest row is badged; archived models are listed separately as history, never recommended. Use it to answer *"Is there a cheaper model that does the job?"*

## 4. Suggestions
Concrete savings cards: potential monthly/annual savings with current → alternative → saved impact strip, plus unit-economics, cached-input, infrastructure, input/output-heavy and high-volume advice.

## 5. Dashboard
Session command center fed only by your calculations: Monthly Cost, Cost/Request, Total Tokens, Total Requests KPIs; cost/token trend chart (needs 2+ calculations); usage distribution; activity log. Before your first calculation it shows a purposeful empty state with a **New Calculation** shortcut.

## 6. Cost scenarios
Scenario scaling (Current, Low 1K, Medium 10K, High 50K, Very High 100K req/mo) lives inside the **Cost Report** page, with per-request/monthly/annual figures alongside the full analysis.

## 7. Cost Report & exports
On the Cost Result page, **Generate Report** freezes the calculation into a snapshot: header with report ID, executive summary, workload table, per-file analysis, selected-model cost, token distribution chart, model comparison (your model highlighted red), cost rankings, savings, the five scenarios, recommendations, methodology, data-quality warnings and pricing reference — plus GPU infrastructure costs when a GPU is selected (or an **NVIDIA H100 placeholder** reference when none is). The **Report** page offers **Export PDF** (Print → Save as PDF), **Print**, **JSON** (full snapshot) and **CSV** (tabular sections). Issued reports never change when you calculate again.

## 8. Settings
- **Appearance** — light/dark theme.
- **Accessibility** — text size, motion.
- **Currency** — display in ₹ (INR) or $ (USD).
- **Calculator defaults** — default output tokens, monthly requests, USD→INR exchange rate applied to every figure.
- **Top bar extras** — display currency, text size, dark mode and the festive rang toggle (celebratory colors, off by default), all instant.

The in-app **Help** page explains the cost formula used.

## 9. Model pricing reference (in-app Guide)
Open **Guide → Model pricing reference** in the sidebar for the full rate card, generated live from the same catalogue the app calculates with — so it can never go stale:
- Grouped **company → family → model** (e.g. OpenAI → GPT-5 → GPT-5, GPT-5 Mini, …), matching the Calculator picker order.
- Per model: **Input $/1M, Output $/1M, context window**, Active/Archived badge, and an *Unverified pricing* badge where no cost figure is produced.
- Each company block links to its **official pricing page**.
- Rates are catalogue USD per 1M tokens; the app converts them to INR at your configured exchange rate.
- **GPU pricing reference** — every IndiaAI instance grouped **OEM → GPU type → instance** with on-demand INR/hr, matching the Calculator GPU picker order.

---

## 10. Tips & troubleshooting
- **Files are optional.** Prompt-only, file-only, or combined workloads all work.
- **Remove-then-recalculate** is the fastest way to see one file's cost impact.
- **"Content extraction failed"** on one file never blocks the others; its size-based fallback stays labelled.
- **Stale numbers?** Restart the backend, hard-refresh, and re-run the calculation. If you ever see an *"outdated backend"* notice, that restart is exactly what it's asking for.
- **Trend chart needs 2+ calculations** — each run adds one real data point.
