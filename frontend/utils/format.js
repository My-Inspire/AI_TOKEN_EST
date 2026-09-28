/* =========================================================
   Formatting helpers: numbers, money, bytes, percentages.
   Intl formatters are cached (comparison renders ~50 rows).
   ========================================================= */

import { toFiniteNumber } from "./dom.js";
import { getDisplayCurrency, getExchangeRate, getReferenceRate } from "../app/prefs.js";


const intFormatter = new Intl.NumberFormat("en-US");

const moneyFormatters = new Map();

function moneyFormatter(currency, maxDigits) {
    const key = currency + ":" + maxDigits;
    let formatter = moneyFormatters.get(key);
    if (!formatter) {
        formatter = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
            style: "currency",
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: maxDigits
        });
        moneyFormatters.set(key, formatter);
    }
    return formatter;
}

export function formatInt(value) {
    const number = toFiniteNumber(value);
    if (number === null) return "-";
    return intFormatter.format(Math.round(number));
}

function formatMoney(value, currency = "INR") {
    if (value === null || value === undefined) return "-";
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    // Same display tiers as before (2 / 4 / 8dp), formatters cached.
    const abs = Math.abs(number);
    const maxDigits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8;
    return moneyFormatter(currency, maxDigits).format(number);
}

/* Cost display entry point: values are always INR internally;
   USD display converts back at the effective rate. */
export function formatCost(inrValue) {
    if (inrValue === null || inrValue === undefined) return "-";
    const n = Number(inrValue);
    if (!Number.isFinite(n)) return "-";
    if (getDisplayCurrency() === "USD") {
        return formatMoney(n / getExchangeRate(getReferenceRate()), "USD");
    }
    return formatMoney(n, "INR");
}

/* Per-1M rate display (rates are INR-per-1M internally). */
export function formatPerMillion(inrRate) {
    if (inrRate === null || inrRate === undefined) return "—";
    const n = Number(inrRate);
    if (!Number.isFinite(n)) return "—";
    if (getDisplayCurrency() === "USD") {
        return "$" + (n / getExchangeRate(getReferenceRate())).toFixed(2) + "/1M";
    }
    return formatMoney(n, "INR") + "/1M";
}

export function formatPercent(value, decimals = 1) {
    const number = toFiniteNumber(value);
    if (number === null) return "-";
    return number.toFixed(decimals) + "%";
}

/* File sizes: "512 B", "1.4 KB", "2.3 MB" */
export function formatBytes(bytes) {
    const number = toFiniteNumber(bytes);
    if (number === null || number < 0) return "-";
    if (number < 1024) return Math.round(number) + " B";
    if (number < 1024 * 1024) {
        const kb = number / 1024;
        return (kb < 10 ? kb.toFixed(1) : Math.round(kb).toString()) + " KB";
    }
    const mb = number / (1024 * 1024);
    return (mb < 10 ? mb.toFixed(1) : Math.round(mb).toString()) + " MB";
}
