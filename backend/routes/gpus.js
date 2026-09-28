/* GET /api/gpus — IndiaAI GPU picker data + summary.
   INR-native catalogue (backend/data/gpuIndiaAI.js). */

import { listGpuInstances, listGpuOems, getGpuSummary, GPU_INDIAAI_SOURCE } from "../data/gpuIndiaAI.js";
import { GPU_PRICING_TIERS, GPU_DEFAULT_TIER } from "../services/gpuService.js";

export async function handleGpus() {
    return {
        status: 200,
        json: {
            currency: GPU_INDIAAI_SOURCE.currency,
            unit: GPU_INDIAAI_SOURCE.unit,
            defaultPricingTier: GPU_DEFAULT_TIER,
            pricingTiers: GPU_PRICING_TIERS,
            oems: listGpuOems(),
            instances: listGpuInstances(),
            summary: getGpuSummary()
        }
    };
}
