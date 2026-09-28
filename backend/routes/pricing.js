/* GET /api/pricing — rates transparency (USD source) + meta. */

import {
    PRICING_CURRENCY_SOURCE,
    PRICING_UNIT,
    DISPLAY_CURRENCY,
    EXCHANGE_RATE_DEFAULT,
    buildRatesTable
} from "../data/pricing.js";
import { buildVerificationSummary } from "../data/sources.js";
import { env } from "../config/environment.js";

export async function handlePricing() {
    return {
        status: 200,
        json: {
            currency: DISPLAY_CURRENCY,
            unit: PRICING_UNIT,
            sourceCurrency: PRICING_CURRENCY_SOURCE,
            usdToInr: env.RATE_USD_INR ?? EXCHANGE_RATE_DEFAULT.USD_TO_INR,
            asOf: EXCHANGE_RATE_DEFAULT.asOf,
            note: EXCHANGE_RATE_DEFAULT.note,
            rates: buildRatesTable(),
            verification: buildVerificationSummary()
        }
    };
}
