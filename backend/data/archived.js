/* =========================================================
   Archived-model views. Derived from the catalogue — no
   duplicated model list lives here.
   ========================================================= */

import { MODEL_FAMILIES } from "./catalogue.js";

export function getActiveModels() {
    return Object.values(MODEL_FAMILIES).filter((m) => m.status !== "archived");
}

export function getArchivedModels() {
    return Object.values(MODEL_FAMILIES).filter((m) => m.status === "archived");
}

export function getArchiveSummary() {
    const active = getActiveModels().length;
    const archived = getArchivedModels().length;
    return {
        totalModels: active + archived,
        activeModels: active,
        archivedModels: archived,
        note: "Archived models carry last-documented historical pricing for past-workload estimates; never recommended."
    };
}
