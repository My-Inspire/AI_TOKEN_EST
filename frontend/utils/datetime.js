/* =========================================================
   Central date/time logic. Runtime `Date` is the single source
   of truth — no hardcoded months, years or timestamps. Month
   math uses Date overflow so Feb/leap/30/31-day months and
   Dec→Jan rollovers resolve correctly.
   ========================================================= */

const dayMonthYear = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric"
});

const dateAndTime = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit"
});

/* Current instant. */
function now() {
    return new Date();
}

/* ISO timestamp for storing operation records. */
export function timestamp(date = now()) {
    return new Date(date).toISOString();
}

/* "Sep 7, 2026" in the user's locale. */
function formatDate(date) {
    return dayMonthYear.format(new Date(date));
}

/* "Sep 7, 2026, 10:30 AM" in the user's locale. */
export function formatDateTime(date = now()) {
    return dateAndTime.format(new Date(date));
}

const hourMinute = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/* "10:30 AM" axis label in the user's locale. */
export function formatTime(date) {
    return hourMinute.format(new Date(date));
}

/* First/last day + display label of the month containing `at`. */
export function currentMonthRange(at = now()) {
    const base = new Date(at);
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { start, end, label: `${formatDate(start)} – ${formatDate(end)}` };
}

/* Relative activity time: Just now → minutes → hours → Yesterday → date. */
export function timeAgo(iso, nowMs = Date.now()) {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "—";
    const diff = nowMs - then;
    if (diff < 0) return "Just now";
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return "Just now";
    if (diff < hour) {
        const n = Math.floor(diff / minute);
        return n === 1 ? "1 minute ago" : `${n} minutes ago`;
    }
    if (diff < day) {
        const n = Math.floor(diff / hour);
        return n === 1 ? "1 hour ago" : `${n} hours ago`;
    }
    if (diff < 2 * day) return "Yesterday";
    return formatDate(then);
}
