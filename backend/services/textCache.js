/* =========================================================
   Estimate-text cache (authoritative, in-memory).
   /api/files/parse already receives full file content, so
   /api/calculate (and compare/reports) must not require the
   same megabytes to be uploaded a second time: parse stores
   the extracted text under a content-hash ref, calculate sends
   the ref. Bounded (FIFO eviction) so enterprise-size
   workloads cannot grow memory without limit. Refs are content
   hashes, not secrets — this app has no auth boundary.
   A ref miss (e.g. server restarted after parsing) is never
   silent: callers fall back to a labelled size estimate.
   ========================================================= */

import { createHash } from "node:crypto";

const MAX_CACHED_BYTES = 200 * 1024 * 1024;

const cache = new Map();
let cachedBytes = 0;

export function putText(text) {
    if (typeof text !== "string" || !text) return null;
    const bytes = Buffer.byteLength(text, "utf8");
    const ref = "tref_" + createHash("sha256").update(text, "utf8").digest("hex").slice(0, 24);
    if (!cache.has(ref)) {
        cache.set(ref, { text, bytes });
        cachedBytes += bytes;
        while (cachedBytes > MAX_CACHED_BYTES && cache.size > 1) {
            const oldest = cache.keys().next().value;
            if (oldest === ref) break;
            cachedBytes -= cache.get(oldest).bytes;
            cache.delete(oldest);
        }
    }
    return ref;
}

export function getText(ref) {
    if (typeof ref !== "string" || !ref) return null;
    return cache.get(ref)?.text ?? null;
}
