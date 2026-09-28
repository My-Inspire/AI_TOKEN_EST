/* =========================================================
   Recommendation engine (authoritative). Returns structured
   data with RAW INR numbers — never preformatted strings —
   so the frontend owns all display formatting (₹/$ toggle).
   ========================================================= */

export function buildRecommendation(result, allModelsComparison = []) {
    const makeComposite = (items, summary) => ({
        type: "composite",
        title: "Optimization Analysis",
        items,
        summary
    });

    if (!result.priced) {
        return makeComposite([{
            type: "info",
            title: "Pricing Unavailable",
            detail: "unverified-pricing",
            message: `${result.pricingNote || "Pricing unavailable."} Token counts are estimated, but no cost figure can be produced until pricing is configured.`,
            priority: "medium",
            actionable: false
        }], {
            hasSaving: false,
            currentMonthly: null,
            cheapestMonthly: null,
            cheapestModelName: null,
            savingsMonthly: null,
            savingsAnnual: null,
            savingsPercent: null
        });
    }

    if (result.totalTokens <= 0) {
        return makeComposite([{
            type: "info",
            title: "No Workload Data",
            detail: "empty-workload",
            message: "Add a prompt or upload a workload file to estimate usage and costs.",
            priority: "medium",
            actionable: true
        }], {
            hasSaving: false,
            currentMonthly: null,
            cheapestMonthly: null,
            cheapestModelName: null,
            savingsMonthly: null,
            savingsAnnual: null,
            savingsPercent: null
        });
    }

    const inputRatio = result.inputTokens / result.totalTokens;
    const outputRatio = result.outputTokens / result.totalTokens;
    const currentMonthly = result.monthlyCost;

    const pricedAlternatives = allModelsComparison
        .filter((r) => r.priced && r.modelId !== result.modelId && r.monthlyCost !== null)
        .sort((a, b) => a.monthlyCost - b.monthlyCost);

    const cheapestAlternative = pricedAlternatives[0];
    const savings = cheapestAlternative && currentMonthly !== null
        ? currentMonthly - cheapestAlternative.monthlyCost
        : null;
    const savingsPercent = savings !== null && currentMonthly > 0
        ? (savings / currentMonthly) * 100
        : null;
    const hasSaving = Boolean(cheapestAlternative && savings !== null && savings > 0);

    const recommendations = [];

    if (inputRatio > 0.8) {
        recommendations.push({
            type: "optimization",
            title: "Input-Heavy Workload",
            detail: "input-heavy",
            message: `${(inputRatio * 100).toFixed(0)}% of tokens are input. Prompt compression, repeated-prefix caching, or lower input pricing usually dominates optimization.`,
            priority: "high",
            data: { inputPercent: inputRatio * 100 }
        });
    } else if (outputRatio > 0.6) {
        recommendations.push({
            type: "optimization",
            title: "Output-Heavy Workload",
            detail: "output-heavy",
            message: `${(outputRatio * 100).toFixed(0)}% of tokens are output. Validate expected completions and compare models by output-token cost, not just blended cost.`,
            priority: "high",
            data: { outputPercent: outputRatio * 100 }
        });
    } else {
        recommendations.push({
            type: "info",
            title: "Balanced Token Profile",
            detail: "balanced-profile",
            message: `Input/output ratio is balanced (${(inputRatio * 100).toFixed(0)}% / ${(outputRatio * 100).toFixed(0)}%). Compare total monthly cost and deployment constraints together.`,
            priority: "low",
            data: { inputPercent: inputRatio * 100, outputPercent: outputRatio * 100 }
        });
    }

    if (hasSaving) {
        recommendations.push({
            type: "savings",
            title: "Model Substitution",
            detail: "model-substitution",
            message: `Switching to ${cheapestAlternative.modelName} lowers the monthly estimate.`,
            priority: "high",
            data: {
                alternativeModelId: cheapestAlternative.modelId,
                alternativeModelName: cheapestAlternative.modelName,
                currentMonthly,
                alternativeMonthly: cheapestAlternative.monthlyCost,
                savings,
                savingsAnnual: savings * 12,
                savingsPercent
            }
        });
    }

    if (result.costPer1MTokens !== null) {
        recommendations.push({
            type: "insight",
            title: "Effective Cost per 1M Tokens",
            detail: "unit-economics",
            message: "Blended unit economics for this workload.",
            priority: "low",
            data: { costPer1MTokens: result.costPer1MTokens, costPer1KTokens: result.costPer1KTokens }
        });
    }

    if (!result.pricingNote && result.pricing?.cachedInput) {
        recommendations.push({
            type: "optimization",
            title: "Cached Input Pricing Available",
            detail: "cached-input",
            message: "This model has cached-input pricing configured. If prompts share stable prefixes, test the cached-input option before changing providers.",
            priority: "medium",
            data: { cachedInputRate: result.pricing.cachedInput }
        });
    }

    /* V3: infrastructure attaches via GPU selection on any deployment —
       surface it whenever priced infra exists, not only for private. */
    if (result.hasInfrastructure === true || result.deployment === "self-hosted" || result.deployment === "private") {
        if (result.infrastructureCost?.hasRealPricing) {
            recommendations.push({
                type: "info",
                title: "Infrastructure Included in Total",
                detail: "infra-included",
                message: "GPU infrastructure is included in the total operating estimate.",
                priority: "medium",
                data: {
                    infraMonthly: result.infrastructureCost.monthlyInfrastructureCost,
                    totalMonthly: result.totalMonthlyCost
                }
            });
        } else {
            recommendations.push({
                type: "warning",
                title: "Infrastructure Cost Not Configured",
                detail: "infra-missing",
                message: "Private deployment selected without configured GPU cost. Total operating cost cannot be evaluated until infrastructure pricing is supplied.",
                priority: "high",
                actionable: true,
                data: null
            });
        }
    }

    if (result.monthlyRequests >= 50000) {
        recommendations.push({
            type: "insight",
            title: "High Volume — Negotiate or Batch",
            detail: "high-volume",
            message: `At ${result.monthlyRequests} requests/month, evaluate batch pricing, reserved capacity, or committed-use discounts. Avoid assuming list price remains optimal at scale.`,
            priority: "medium",
            data: { monthlyRequests: result.monthlyRequests }
        });
    }

    return makeComposite(recommendations, {
        hasSaving,
        currentMonthly,
        cheapestMonthly: hasSaving ? cheapestAlternative.monthlyCost : null,
        cheapestModelName: hasSaving ? cheapestAlternative.modelName : null,
        savingsMonthly: hasSaving ? savings : null,
        savingsAnnual: hasSaving ? savings * 12 : null,
        savingsPercent: hasSaving ? savingsPercent : null
    });
}
