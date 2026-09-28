/* =========================================================
   GPU / infrastructure modelling (authoritative, INR).
   IndiaAI INR instances (data/gpuIndiaAI.js) are already
   INR/hr — used verbatim, never fx-converted.
   Default IndiaAI tier: onDemand. An explicit hourlyCost
   overrides the listed instance rate (negotiated rates).
   ========================================================= */

import { getGpuInstance } from "../data/gpuIndiaAI.js";

export const GPU_PRICING_TIERS = ["onDemand", "reserved1M", "reserved6M", "reserved12M"];
export const GPU_DEFAULT_TIER = "onDemand";

export function resolveGpuTier(tier) {
    if (!tier) return GPU_DEFAULT_TIER;
    return GPU_PRICING_TIERS.includes(tier) ? tier : null;
}

export function calculateGPUCost({
    gpuInstanceId,
    gpuPricingTier,
    hourlyCost,
    runtimeHours,
    estimatedRequests,
    fx
}) {
    if (!Number.isFinite(Number(fx)) || Number(fx) <= 0) {
        throw new Error("gpuService: finite positive fx rate required");
    }

    /* ---- IndiaAI INR-native path ---- */
    const tier = resolveGpuTier(gpuPricingTier);
    if (tier === null) {
        throw new Error(`gpuService: unknown pricing tier "${gpuPricingTier}".`);
    }
    const instance = gpuInstanceId ? getGpuInstance(gpuInstanceId) : null;
    if (gpuInstanceId && !instance) {
        return {
            source: "indiaai",
            instanceId: gpuInstanceId,
            pricingTier: tier,
            gpu: gpuInstanceId,
            hourlyCost: null,
            runtimeHours: runtimeHours ?? 0,
            estimatedRequests: estimatedRequests || 0,
            monthlyInfrastructureCost: null,
            annualInfrastructureCost: null,
            costPerRequest: null,
            hasRealPricing: false,
            note: `Unknown GPU instance "${gpuInstanceId}". Select a GPU from the IndiaAI catalogue.`
        };
    }
    if (instance) {
        const listedHourly = instance.pricing?.[tier] ?? null;
        const configuredHourlyCost = hourlyCost ?? listedHourly;
        const hoursPerDay = runtimeHours ?? 0;
        const hasRealPricing = configuredHourlyCost !== null && configuredHourlyCost !== undefined;
        if (!hasRealPricing || !hoursPerDay) {
            return {
                source: "indiaai",
                instanceId: instance.id,
                pricingTier: tier,
                gpu: `${instance.gpuType} ${instance.instanceType}`,
                oem: instance.oem,
                cards: instance.cards,
                memoryGB: instance.memoryGB,
                hourlyCost: configuredHourlyCost,
                runtimeHours: hoursPerDay,
                estimatedRequests: estimatedRequests || 0,
                monthlyInfrastructureCost: null,
                annualInfrastructureCost: null,
                costPerRequest: null,
                hasRealPricing: false,
                note: "GPU hourly cost is not configured; infrastructure cost is unavailable."
            };
        }
        const monthlyCost = configuredHourlyCost * hoursPerDay * 30;
        const annualCost = monthlyCost * 12;
        const monthlyRequests = estimatedRequests || null;
        return {
            source: "indiaai",
            instanceId: instance.id,
            pricingTier: tier,
            gpu: `${instance.gpuType} ${instance.instanceType}`,
            oem: instance.oem,
            cards: instance.cards,
            memoryGB: instance.memoryGB,
            hourlyCost: configuredHourlyCost,
            runtimeHours: hoursPerDay,
            estimatedRequests: estimatedRequests || 0,
            monthlyInfrastructureCost: monthlyCost,
            annualInfrastructureCost: annualCost,
            costPerRequest: monthlyRequests > 0 ? monthlyCost / monthlyRequests : null,
            hasRealPricing: true
        };
    }

    /* ---- No catalogue instance: an explicit hourly override still
       models infrastructure (negotiated rate, no instance linked). ---- */
    const hoursPerDay = runtimeHours ?? 0;
    if (hourlyCost !== null && hourlyCost !== undefined && hoursPerDay) {
        const monthlyCost = hourlyCost * hoursPerDay * 30;
        const annualCost = monthlyCost * 12;
        const monthlyRequests = estimatedRequests || null;
        return {
            source: "indiaai",
            instanceId: gpuInstanceId || null,
            pricingTier: tier,
            gpu: null,
            hourlyCost,
            runtimeHours: hoursPerDay,
            estimatedRequests: estimatedRequests || 0,
            monthlyInfrastructureCost: monthlyCost,
            annualInfrastructureCost: annualCost,
            costPerRequest: monthlyRequests > 0 ? monthlyCost / monthlyRequests : null,
            hasRealPricing: true,
            note: "Custom hourly rate applied without a catalogue instance."
        };
    }

    return {
        source: "indiaai",
        instanceId: gpuInstanceId || null,
        pricingTier: tier,
        gpu: gpuInstanceId || null,
        hourlyCost: hourlyCost ?? null,
        runtimeHours: hoursPerDay,
            estimatedRequests: estimatedRequests || 0,
            monthlyInfrastructureCost: null,
        annualInfrastructureCost: null,
        costPerRequest: null,
        hasRealPricing: false,
        note: "GPU hourly cost is not configured; infrastructure cost is unavailable."
    };
}
