/* GET /api/models — picker data + catalogue counts. */

import { listModelSummaries, listProviders } from "../services/modelService.js";
import { getArchiveSummary } from "../data/archived.js";

export async function handleModels() {
    const summary = getArchiveSummary();
    return {
        status: 200,
        json: {
            /* Picker needs both groups: the frontend splits active /
               archived dynamically via each model's `status` field. */
            models: listModelSummaries(true),
            providers: listProviders(),
            counts: {
                totalModels: summary.totalModels,
                activeModels: summary.activeModels,
                archivedModels: summary.archivedModels
            }
        }
    };
}
